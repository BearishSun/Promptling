# Implementation Plan: Shadow Parameter Set Support in UniformBufferPools

## Summary

Fix validation error where shadows require `Vertex|Fragment|Geometry` stages but PerObject buffers are allocated with only `Vertex|Fragment`. Extend `UniformBufferPools` to return multiple parameter sets per allocation, sharing the same underlying buffer.

## Problem

- `RenderablePool` allocates PerObject buffers with `Vertex|Fragment` stage visibility
- Shadow rendering (point light cubemap) uses geometry shaders requiring `Vertex|Fragment|Geometry`
- Current workaround in `ShadowRendering` creates separate parameter sets per-frame - not integrated with centralized pool system

## Solution: Multi-Layout Parameter Sets

Add `ParameterSetType` enum and extend `AllocationResult` to store multiple parameter sets (indexed by type), similar to existing `GetSuballocation(BufferType)` pattern.

## Phases

### Phase 1: Extend UniformBufferPools API

**B3DUniformBufferPools.h**

- [ ] Add `ParameterSetType` enum: `{ DefaultParameterSet = 0, ShadowParameterSet = 1 }`
- [ ] Change `PoolConfiguration::Layout` to `TInlineArray<SPtr<GpuPipelineParameterSetLayout>, 2> Layouts`
- [ ] Change `AllocationResult::ParameterSet` to `TInlineArray<SPtr<GpuParameterSet>, 2> ParameterSets`
- [ ] Add `AllocationResult::GetParameterSet(ParameterSetType type = DefaultParameterSet)` helper
- [ ] Update `PoolGroup` to have `TInlineArray<...> ParameterSetLayouts` and per-type cache maps

### Phase 2: Update UniformBufferPools Implementation

**B3DUniformBufferPools.cpp**

- [ ] Update `Initialize()` to store multiple layouts per pool group
- [ ] Update `Allocate()` to create parameter sets for all registered layouts
- [ ] Update `GetOrCreateParameterSet()` to accept `layoutIndex` parameter
- [ ] Update `ReleaseParameterSet()` to release from all layout caches

### Phase 3: Configure Shadow Layout in RenderBeast

**B3DRenderBeast.h**

- [ ] Add `ShadowParameterSetInfo` struct with layout and dynamic offset index
- [ ] Add `mShadowParameterSetInfo` member

**B3DRenderBeast.cpp**

- [ ] Create shadow layout with `Vertex|Fragment|Geometry` stages (after line 112)
- [ ] Update `RenderablePool` configuration to include both layouts:
  ```cpp
  config.Layouts.Add(mRenderableParameterSetInfo.Layout);  // DefaultParameterSet
  config.Layouts.Add(mShadowParameterSetInfo.Layout);       // ShadowParameterSet
  ```

### Phase 4: Update Consumers

**B3DRendererObject.h**

- [ ] Add `ShadowPerObjectParameterSet` member

**B3DRenderBeastScene.cpp** (allocation sites)

- [ ] Update allocation to store both parameter sets:
  ```cpp
  rendererRenderable->PerObjectParameterSet = result.GetParameterSet(DefaultParameterSet);
  rendererRenderable->ShadowPerObjectParameterSet = result.GetParameterSet(ShadowParameterSet);
  ```

### Phase 5: Remove Shadow Workaround

**B3DShadowRendering.h**

- [ ] Remove `mShadowPerObjectLayout` member
- [ ] Remove `mShadowParameterSets` map and `ShadowParameterSetEntry`
- [ ] Remove `GetOrCreateShadowParameterSet()` declaration

**B3DShadowRendering.cpp**

- [ ] Remove shadow layout creation code (lines 835-848)
- [ ] Remove `GetOrCreateShadowParameterSet()` implementation (lines 863-881)
- [ ] Remove `mShadowParameterSets.clear()` (line 898)
- [ ] Update shadow render queue options to use `renderable.ShadowPerObjectParameterSet` directly

## Files to Modify

| File | Changes |
|------|---------|
| `Framework/Source/Plugins/bsfRenderBeast/Utility/B3DUniformBufferPools.h` | Add enum, extend structs |
| `Framework/Source/Plugins/bsfRenderBeast/Utility/B3DUniformBufferPools.cpp` | Update pool logic |
| `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.h` | Add shadow layout info |
| `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.cpp` | Create shadow layout, update config |
| `Framework/Source/Plugins/bsfRenderBeast/B3DRendererObject.h` | Add shadow param set member |
| `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeastScene.cpp` | Update allocation usage |
| `Framework/Source/Plugins/bsfRenderBeast/Shading/B3DShadowRendering.h` | Remove workaround members |
| `Framework/Source/Plugins/bsfRenderBeast/Shading/B3DShadowRendering.cpp` | Remove workaround code |

## Technical Notes

- **Memory**: Minimal impact - parameter sets are shared per buffer combination
- **Performance**: Shadow rendering benefits from cached parameter sets vs per-frame recreation
- **Extensibility**: Pattern supports future additional layout types if needed