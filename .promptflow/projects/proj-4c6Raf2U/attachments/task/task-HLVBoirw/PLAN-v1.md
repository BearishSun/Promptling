# Implementation Plan: PerCamera buffer per-frame recreation

## Summary
The PerCamera uniform buffer is currently created once in `RendererView` constructor and reused across frames. This causes a race condition where the CPU updates the buffer for frame N+1 while the GPU may still be reading it for frame N (or N-1). The fix is to use the transient allocation pattern which automatically handles frame-in-flight management.

## Problem Analysis

**Current Implementation (B3DRendererView.cpp:67-68, 73):**
```cpp
RendererView::RendererView()
{
    mUniformBuffer = gPerCameraUniformDefinition.CreateBuffer();  // Created once
}
```

**Update Location (B3DRendererView.cpp:780-844):**
```cpp
void RendererView::UpdatePerViewBuffer()
{
    GpuBufferMappedScope uniforms = mUniformBuffer->Map(GpuMapOption::Write);
    // ... writes to buffer every frame
}
```

**The Issue:**
- GPU processing is asynchronous; frames are queued (typically 2-3 frames in-flight)
- When frame N+1 calls `UpdatePerViewBuffer()`, the GPU may still be reading data from frame N
- Writing to the same buffer corrupts the data the GPU is currently using

## Solution Approach

Use `AllocateTransient()` instead of `CreateBuffer()`. The transient allocation pool:
1. Maintains a pool of buffer suballocations
2. Automatically tracks which allocations are safe to reuse based on frame index
3. Guarantees allocations remain valid for `RenderThread::kMaximumFramesInFlight` frames

This pattern is already used extensively throughout RenderBeast (70+ usages found in the codebase).

## Phases

### Phase 1: Modify RendererView class definition
- [ ] Remove `SPtr<GpuBuffer> mUniformBuffer` member variable from `RendererView` class
- [ ] Add new transient member: track the current frame's allocation (optional, for debugging)

### Phase 2: Update UpdatePerViewBuffer method
- [ ] Change `UpdatePerViewBuffer()` to return `GpuBufferSuballocation` instead of `void`
- [ ] Replace `mUniformBuffer->Map()` with `gPerCameraUniformDefinition.AllocateTransient().Map()`
- [ ] Return the transient allocation for callers to use

### Phase 3: Update GetPerViewBuffer method
- [ ] Update `GetPerViewBuffer()` signature to return `GpuBufferSuballocation` 
- [ ] Store the transient allocation from `UpdatePerViewBuffer()` for the current frame
- [ ] Return the stored allocation

### Phase 4: Update all callers
Update all locations that call `GetPerViewBuffer()` to handle `GpuBufferSuballocation`:
- [ ] `SkyboxMaterial::Bind()` - already uses `SPtr<GpuBuffer>`, update parameter type
- [ ] `RCNodeSkybox` and other compositor nodes
- [ ] Shadow rendering code
- [ ] Light grid code
- [ ] Any material bindings that use PerCamera

### Phase 5: Remove constructor buffer creation
- [ ] Remove `mUniformBuffer = gPerCameraUniformDefinition.CreateBuffer()` from both constructors

## Files to Modify

### B3DRendererView.h
- Change `SPtr<GpuBuffer> mUniformBuffer` to `GpuBufferSuballocation mPerCameraBuffer`
- Update `GetPerViewBuffer()` return type from `SPtr<GpuBuffer>` to `const GpuBufferSuballocation&`
- Update `UpdatePerViewBuffer()` return type to `void` (or keep as-is, storing internally)

### B3DRendererView.cpp
- Remove buffer creation from constructors (lines 67, 73)
- Update `UpdatePerViewBuffer()` to use transient allocation
- Store the allocation in member variable for `GetPerViewBuffer()`

### Callers that need updates (search for `GetPerViewBuffer` or `PerCamera`):
- B3DRendererView.cpp (SkyboxMaterial::Bind)
- B3DShadowRendering.cpp 
- B3DTiledDeferred.cpp
- B3DStandardDeferred.cpp
- B3DLightProbes.cpp
- B3DLightGrid.cpp
- B3DPostProcessing.cpp
- B3DGpuParticleSimulationMaterials.cpp
- B3DRenderCompositor.cpp
- B3DRendererRenderable.h
- B3DRendererDecal.h
- B3DRendererParticles.h
- B3DGUIManager.cpp

## Technical Approach

**Before (problematic):**
```cpp
// Constructor - buffer created once
mUniformBuffer = gPerCameraUniformDefinition.CreateBuffer();

// Every frame - same buffer modified
void RendererView::UpdatePerViewBuffer()
{
    GpuBufferMappedScope uniforms = mUniformBuffer->Map(GpuMapOption::Write);
    gPerCameraUniformDefinition.gMatProj.Set(uniforms, mProperties.ProjTransform);
    // ...
}

SPtr<GpuBuffer> GetPerViewBuffer() const { return mUniformBuffer; }
```

**After (correct):**
```cpp
// No buffer in constructor

// Every frame - new transient allocation
void RendererView::UpdatePerViewBuffer()
{
    mPerCameraBuffer = gPerCameraUniformDefinition.AllocateTransient();
    GpuBufferMappedScope uniforms = mPerCameraBuffer.Map();
    gPerCameraUniformDefinition.gMatProj.Set(uniforms, mProperties.ProjTransform);
    // ...
}

const GpuBufferSuballocation& GetPerViewBuffer() const { return mPerCameraBuffer; }
```

## API Changes

The `GpuBufferSuballocation` type can be implicitly converted to `SPtr<GpuBuffer>` via `GetBuffer()`, but callers binding to `GpuParameterSet::SetUniformBuffer()` will need to be updated since that method likely has overloads for both types.

Check `GpuParameterSet::SetUniformBuffer` signature to ensure it accepts `GpuBufferSuballocation` (it likely does based on the transient allocation pattern usage in the codebase).

## Testing

1. **Visual verification**: Ensure rendering output is identical before/after change
2. **Multi-frame validation**: Run with validation layers (Vulkan) to detect race conditions
3. **Performance check**: Transient allocations should be equal or faster (no GPU->CPU sync)
4. **Edge cases**: 
   - Multiple views/cameras
   - On-demand rendering
   - Temporal effects (TAA, motion blur) that use previous frame data

## Risks & Considerations

1. **Lifetime management**: Transient allocations are only valid for `kMaximumFramesInFlight` frames - ensure no code stores the buffer reference longer than one frame
2. **Previous frame data**: Some effects may need previous frame's PerCamera data - verify these still work correctly (they use `gMatPrevViewProj` which is stored in the current frame's buffer)
3. **Shadow rendering**: Multiple shadow passes per frame - verify each gets correct per-camera data
