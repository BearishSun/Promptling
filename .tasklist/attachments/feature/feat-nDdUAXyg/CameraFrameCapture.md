# Camera Frame Capture Implementation Plan

## Overview

This document details the implementation of `Camera::RequestCapture()`, a feature that allows users to asynchronously capture the rendered frame from a camera as pixel data.

### Requirements

- **API**: `TAsyncOp<SPtr<PixelData>> Camera::RequestCapture()`
- **Thread model**: Request on main thread, capture on render thread
- **Async GPU read**: Don't stall GPU, use completion callbacks
- **Timing**: Capture after RenderCompositor and overlays complete
- **Window handling**: Copy window-backed render targets to readable textures
- **Multiple requests**: Queue all capture requests
- **Error handling**: Return null for inactive cameras (no viewport)

---

## Architecture

### Flow Diagram

```
Main Thread                  Render Thread                GPU
-----------                  -------------                ---

Camera::RequestCapture()
  |
  | Validate (has viewport?)
  | Create TAsyncOp
  |
  | PostCommand ───────────> Renderer::RequestCapture()
  |                            |
  |                            | Find RendererView
  |                            v
  |                          RendererView::QueueCapture()
  |                            | (store in mPendingCaptures)
  |                            |
  |                          [Frame renders...]
  |                            |
  |                          RenderCompositor executes
  |                          Overlays render
  |                            |
  |                            v
  |                          ProcessPendingCaptures()
  |                            |
  |                            | If window target:
  |                            |   Create temp texture
  |                            |   Copy window -> temp ──> GPU Copy
  |                            |
  |                            v
  |                          Texture::ReadDataAsync()
  |                            |
  |                            | Queue GPU read ────────> GPU Read
  |                            |
  |                            v                              |
  |                          CommandBuffer::OnDidComplete      |
  |                            register callback               |
  |                                                            |
  |                            [Wait for GPU...]               |
  |                                                            v
  |                          <─────────────────────── Read completes
  |                            |
  |                            v
  |                          Callback: copy to PixelData
  |                            |
  |                            v
  |                          TAsyncOp::CompleteOperation()
  |                            |
  | DoWhenComplete() <─────────┘
  | callback fires
  v
User receives PixelData
```

---

## Detailed Implementation

### 1. Camera::RequestCapture() - Main Thread Entry Point

**File**: `Framework/Source/Foundation/Core/Components/B3DCamera.h`

Add public method declaration:

```cpp
/**
 * Requests an asynchronous capture of the next rendered frame from this camera.
 *
 * The capture will occur on the render thread after the frame completes rendering
 * (including compositor and overlays). The returned async operation will complete
 * when the GPU read finishes.
 *
 * @return  Async operation that will contain the captured pixel data, or nullptr
 *          if the camera is inactive (no viewport or render target). The pixel
 *          format will match the camera's render target format.
 *
 * @note    This is a queued operation - the specific frame captured depends on when
 *          the request is processed by the render thread.
 * @note    Multiple requests can be pending simultaneously and will be fulfilled in order.
 */
TAsyncOp<SPtr<PixelData>> RequestCapture();
```

**File**: `Framework/Source/Foundation/Core/Components/B3DCamera.cpp`

Implementation:

```cpp
TAsyncOp<SPtr<PixelData>> Camera::RequestCapture()
{
	// Validate camera state on main thread
	SPtr<Viewport> viewport = GetViewport();
	if (viewport == nullptr || viewport->GetTarget() == nullptr)
	{
		// Camera is inactive - return completed operation with null result
		B3D_LOG(Warning, Renderer, "RequestCapture called on camera with no viewport or render target");
		return TAsyncOp<SPtr<PixelData>>(nullptr);
	}

	// Create async operation that will be completed on render thread
	TAsyncOp<SPtr<PixelData>> asyncOp;

	// Get render thread proxy
	auto renderCamera = B3DGetRenderProxy(this);

	// Post command to render thread
	auto fnRequestCapture = [renderCamera, asyncOp]() mutable
	{
		// Execute on render thread
		Renderer* renderer = GetRenderer();
		if (renderer != nullptr)
			renderer->RequestCapture(renderCamera, asyncOp);
		else
		{
			// No renderer - complete with null
			asyncOp.CompleteOperation(nullptr);
		}
	};

	GetRenderThread().PostCommand(
		fnRequestCapture,
		"Camera::RequestCapture",
		false,  // Don't wait for completion
		GetName()
	);

	return asyncOp;
}
```

**Key Points:**
- Validate viewport exists before posting to render thread (fail fast)
- Capture `TAsyncOp` by value in lambda (mutable for CompleteOperation)
- Don't wait for command completion (async by design)
- Delegate actual work to `Renderer::RequestCapture()`

---

### 2. Renderer::RequestCapture() - Virtual Interface

**File**: `Framework/Source/Foundation/Core/Renderer/B3DRenderer.h`

Add pure virtual method to `Renderer` class:

```cpp
/**
 * Requests a frame capture for the specified camera.
 *
 * The renderer should queue the capture request and fulfill it after the camera's
 * view completes rendering (including compositor and overlays). The async operation
 * should be completed with the captured pixel data, or nullptr if the camera has
 * no associated view.
 *
 * @param camera   The camera whose view should be captured.
 * @param asyncOp  Async operation to complete when capture finishes.
 *
 * @note This is called on the render thread.
 */
virtual void RequestCapture(render::Camera* camera, TAsyncOp<SPtr<PixelData>> asyncOp) = 0;
```

**Rationale:**
- Keeps `RendererView` as an implementation detail
- Allows different renderers to implement capture differently
- Clean separation of concerns

---

### 3. RenderBeast::RequestCapture() - Implementation

**File**: `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.h`

Add override declaration:

```cpp
/** @copydoc Renderer::RequestCapture */
void RequestCapture(render::Camera* camera, TAsyncOp<SPtr<PixelData>> asyncOp) override;
```

**File**: `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.cpp`

Implementation:

```cpp
void RenderBeast::RequestCapture(render::Camera* camera, TAsyncOp<SPtr<PixelData>> asyncOp)
{
	// Find the renderer view associated with this camera
	RendererView* view = nullptr;

	// Search through all views for the one matching this camera
	for (auto& viewInfo : mViews)
	{
		if (viewInfo.view->GetCamera() == camera)
		{
			view = viewInfo.view;
			break;
		}
	}

	// If no view exists, complete with null result
	if (view == nullptr)
	{
		B3D_LOG(Warning, Renderer, "RequestCapture: No view found for camera");
		asyncOp.CompleteOperation(nullptr);
		return;
	}

	// Queue the capture on the view
	view->QueueCapture(asyncOp);
}
```

**Note**: The exact lookup mechanism depends on RenderBeast's internal data structures. You may need to adjust based on how `mViews` is structured (map vs vector, key type, etc.).

**Alternative implementation** if views are stored differently:

```cpp
void RenderBeast::RequestCapture(render::Camera* camera, TAsyncOp<SPtr<PixelData>> asyncOp)
{
	// If views are stored in a map keyed by camera
	auto it = mViews.find(camera);
	if (it != mViews.end())
	{
		it->second->QueueCapture(asyncOp);
	}
	else
	{
		B3D_LOG(Warning, Renderer, "RequestCapture: No view found for camera");
		asyncOp.CompleteOperation(nullptr);
	}
}
```

---

### 4. RendererView - Capture Queue and Processing

**File**: `Framework/Source/Plugins/bsfRenderBeast/B3DRendererView.h`

Add to `RendererView` class (private section):

```cpp
private:
	/**
	 * Represents a pending frame capture request.
	 */
	struct PendingCapture
	{
		TAsyncOp<SPtr<PixelData>> AsyncOp;
	};

	/** Queue of pending frame capture requests */
	Queue<PendingCapture> mPendingCaptures;

	/**
	 * Queues a frame capture request to be processed after the next frame renders.
	 *
	 * @param asyncOp  Async operation to complete when capture finishes.
	 */
	void QueueCapture(TAsyncOp<SPtr<PixelData>> asyncOp);

	/**
	 * Processes all pending capture requests by initiating async GPU reads.
	 * Should be called after compositor and overlays have finished rendering.
	 *
	 * @param commandBuffer  The command buffer used for rendering this frame.
	 */
	void ProcessPendingCaptures(GpuCommandBuffer& commandBuffer);
```

**File**: `Framework/Source/Plugins/bsfRenderBeast/B3DRendererView.cpp`

#### QueueCapture Implementation

```cpp
void RendererView::QueueCapture(TAsyncOp<SPtr<PixelData>> asyncOp)
{
	PendingCapture capture;
	capture.AsyncOp = asyncOp;
	mPendingCaptures.push(capture);
}
```

#### ProcessPendingCaptures Implementation

```cpp
void RendererView::ProcessPendingCaptures(GpuCommandBuffer& commandBuffer)
{
	// Process all pending captures
	while (!mPendingCaptures.empty())
	{
		PendingCapture capture = mPendingCaptures.front();
		mPendingCaptures.pop();

		// Get the final render target for this view (from compositor)
		SPtr<RenderTarget> renderTarget = GetCompositorRenderTarget();
		if (renderTarget == nullptr)
		{
			// No render target - complete with null
			capture.AsyncOp.CompleteOperation(nullptr);
			continue;
		}

		// Get the target's texture
		// Cast RenderTarget to RenderTexture to access texture methods
		// Note: This assumes the target is a RenderTexture (offscreen rendering)
		// Window targets are also RenderTexture instances in the engine
		SPtr<RenderTexture> renderTexture = std::static_pointer_cast<RenderTexture>(renderTarget);

		// Get the first color texture (index 0)
		SPtr<Texture> sourceTexture = renderTexture->GetColorTexture(0);

		if (sourceTexture == nullptr)
		{
			// No color texture available
			capture.AsyncOp.CompleteOperation(nullptr);
			continue;
		}

		// Check if this is a window-backed target
		RenderTargetProperties targetProps = renderTarget->GetProperties();
		bool isWindowTarget = targetProps.IsWindow;

		SPtr<Texture> readableTexture = sourceTexture;
		SPtr<Texture> tempTexture; // Keep alive until GPU read completes

		// If window-backed, we need to copy to a readable texture
		if (isWindowTarget)
		{
			// Create temporary readable texture matching source format and size
			TextureProperties texProps = sourceTexture->GetProperties();

			TEXTURE_DESC tempDesc;
			tempDesc.Type = texProps.GetTextureType();
			tempDesc.Width = texProps.GetWidth();
			tempDesc.Height = texProps.GetHeight();
			tempDesc.Depth = texProps.GetDepth();
			tempDesc.Format = texProps.GetFormat();
			tempDesc.Usage = TU_CPUREADABLE; // Ensure CPU readable
			tempDesc.NumMipmaps = 0; // Only need mip level 0
			tempDesc.NumSamples = 1; // No MSAA for readback

			tempTexture = Texture::Create(tempDesc);

			// Copy from source to temp texture
			TextureCopyInformation copyInfo;
			copyInfo.SrcMipLevel = 0;
			copyInfo.SrcFace = 0;
			copyInfo.SrcVolume = 0;
			copyInfo.DstMipLevel = 0;
			copyInfo.DstFace = 0;
			copyInfo.DstVolume = 0;

			sourceTexture->Copy(commandBuffer, tempTexture, copyInfo);

			readableTexture = tempTexture;
		}

		// Initiate async GPU read
		TAsyncOp<SPtr<PixelData>> readOp = readableTexture->ReadDataAsync(commandBuffer, 0, 0);

		// Chain the read operation to the capture operation
		// When GPU read completes, complete the user's async operation
		readOp.DoWhenComplete([captureOp = capture.AsyncOp, tempTexture](const SPtr<PixelData>& pixelData) mutable
		{
			// tempTexture is captured to keep it alive until read completes
			// It will be destroyed when this lambda is destroyed
			captureOp.CompleteOperation(pixelData);
		});
	}
}
```

**Key Implementation Notes:**

1. **Getting the render target texture**:
   - Cast `RenderTarget` to `RenderTexture` using `std::static_pointer_cast<RenderTexture>()`
   - Call `GetColorTexture(0)` to get the first color surface (returns `SPtr<Texture>`)
   - Both window and offscreen render targets use `RenderTexture` class
   - Check if result is nullptr before use

2. **Window detection**: Use `RenderTargetProperties::IsWindow`

3. **Temporary texture lifetime**:
   - Captured in lambda to keep alive until GPU read completes
   - Automatically destroyed when lambda is destroyed after callback executes

4. **Chaining async operations**:
   - `ReadDataAsync` returns its own `TAsyncOp`
   - Use `DoWhenComplete` to chain it to user's `TAsyncOp`
   - This ensures proper completion order

---

### 5. Integration into Render Pipeline

**File**: `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.cpp`

Modify the `RenderBeast::RenderView()` method to call `ProcessPendingCaptures()` after rendering completes.

**Location**: Find where the view finishes rendering (after compositor and overlays).

**Example integration** (exact location depends on current structure):

```cpp
void RenderBeast::RenderView(RendererView* view, PerFrameData& frameData)
{
	// ... existing rendering code ...

	// Render compositor
	view->GetCompositor()->Render(compositorInputs);

	// Render overlays
	RenderOverlay(view, frameData);

	// Process any pending frame captures
	// This must be after all rendering is complete
	view->ProcessPendingCaptures(*frameData.commandBuffer);

	// ... rest of method ...
}
```

**Important**:
- Must be called AFTER compositor and overlays
- Must have access to the command buffer used for rendering
- The command buffer should still be open (not yet submitted) so we can queue the copy/read

**Alternative**: If the command buffer is submitted before this point, you may need to:
1. Create a new command buffer for the capture operations
2. Submit it after the render command buffer
3. Ensure proper synchronization (the capture CB depends on render CB completing)

---

## Edge Cases and Considerations

### 1. Window-Backed Render Targets

**Problem**: Window swapchain images are often not CPU-readable

**Solution**:
- Detect via `RenderTargetProperties::IsWindow`
- Create temporary texture with `TU_CPUREADABLE` flag
- Copy window texture to temp before reading
- Keep temp alive until GPU read completes (capture in lambda)

### 2. MSAA Render Targets

**Problem**: Multi-sampled textures cannot be directly read

**Solution**:
- Compositor typically resolves MSAA before final output
- Capture the resolved texture (post-compositor)
- If needed, perform explicit resolve before capture

### 3. Camera Lifecycle

**Problem**: Camera could be destroyed between request and capture

**Solution**:
- `TAsyncOp` is independent of camera lifetime
- Render thread uses render::Camera proxy (separate lifetime)
- Even if main camera is destroyed, capture completes
- User receives result via `TAsyncOp` regardless

### 4. View Not Found

**Problem**: Camera may not have associated `RendererView`

**Solution**:
- Complete `TAsyncOp` with `nullptr` immediately
- Log warning for debugging
- User can check result: `if (pixelData != nullptr)`

### 5. Multiple Captures Per Frame

**Problem**: User calls `RequestCapture()` multiple times quickly

**Solution**:
- Queue all requests
- Each gets fulfilled in order
- May capture the same frame multiple times if queued before render
- Or capture sequential frames if rate-limited

### 6. Memory Management

**Concerns**:
- Temporary textures for window captures
- `PixelData` buffers
- Lambda captures

**Solutions**:
- Shared pointers (`SPtr`) handle texture lifetime
- Capture temp texture in lambda to extend lifetime
- `PixelData` allocated in `ReadDataAsync`, owned by `TAsyncOp`
- Lambda destroyed after callback executes, cleaning up captures

### 7. GPU Device Loss

**Problem**: GPU device lost during capture

**Solution**:
- `ReadDataAsync` should handle gracefully (existing implementation)
- Complete `TAsyncOp` with `nullptr` or partial data
- User should handle null results

### 8. Command Buffer Submission

**Critical timing issue**:
- `ProcessPendingCaptures` must be called BEFORE command buffer is submitted
- GPU read is queued on the same command buffer as rendering
- Command buffer completion triggers the read callback

**If command buffer already submitted**:
- Need to create new command buffer
- Queue dependency on render command buffer
- More complex synchronization

---

## Testing Strategy

### Unit Tests

1. **Basic capture**:
   ```cpp
   Camera* camera = CreateTestCamera();
   TAsyncOp<SPtr<PixelData>> op = camera->RequestCapture();
   op.BlockUntilComplete();
   SPtr<PixelData> data = op.GetReturnValue();
   EXPECT_TRUE(data != nullptr);
   EXPECT_EQ(data->GetWidth(), expectedWidth);
   EXPECT_EQ(data->GetHeight(), expectedHeight);
   ```

2. **Inactive camera**:
   ```cpp
   Camera* camera = CreateCameraWithoutViewport();
   TAsyncOp<SPtr<PixelData>> op = camera->RequestCapture();
   EXPECT_TRUE(op.HasCompleted()); // Should complete immediately
   EXPECT_TRUE(op.GetReturnValue() == nullptr);
   ```

3. **Multiple captures**:
   ```cpp
   TAsyncOp<SPtr<PixelData>> op1 = camera->RequestCapture();
   TAsyncOp<SPtr<PixelData>> op2 = camera->RequestCapture();
   TAsyncOp<SPtr<PixelData>> op3 = camera->RequestCapture();

   op3.BlockUntilComplete();
   EXPECT_TRUE(op1.HasCompleted());
   EXPECT_TRUE(op2.HasCompleted());
   EXPECT_TRUE(op3.HasCompleted());
   ```

4. **Window-backed target**:
   ```cpp
   Camera* camera = CreateCameraWithWindowTarget();
   TAsyncOp<SPtr<PixelData>> op = camera->RequestCapture();
   op.BlockUntilComplete();
   SPtr<PixelData> data = op.GetReturnValue();
   EXPECT_TRUE(data != nullptr);
   // Verify copy path was used (may need internal instrumentation)
   ```

5. **Async behavior**:
   ```cpp
   TAsyncOp<SPtr<PixelData>> op = camera->RequestCapture();
   EXPECT_FALSE(op.HasCompleted()); // Should not complete immediately

   bool callbackExecuted = false;
   op.DoWhenComplete([&](const SPtr<PixelData>& data) {
       callbackExecuted = true;
   });

   op.BlockUntilComplete();
   EXPECT_TRUE(callbackExecuted);
   ```

### Integration Tests

1. **Render and capture**:
   - Set up scene with known content
   - Render frame
   - Capture
   - Verify pixel data matches expected content

2. **Format verification**:
   - Test with different render target formats (RGBA8, RGBA16F, etc.)
   - Verify captured `PixelData` format matches

3. **Performance**:
   - Verify no GPU stalls (use profiler)
   - Verify async operations don't block rendering
   - Test with multiple simultaneous captures

4. **Stress test**:
   - Rapidly request captures
   - Verify all complete successfully
   - Check for memory leaks

---

## API Usage Example

```cpp
// Create a camera rendering to a viewport
Camera* camera = sceneObject->AddComponent<Camera>();
camera->GetViewport()->SetTarget(renderWindow);

// Request a frame capture
TAsyncOp<SPtr<PixelData>> captureOp = camera->RequestCapture();

// Option 1: Block until ready (not recommended for real-time apps)
captureOp.BlockUntilComplete();
SPtr<PixelData> pixelData = captureOp.GetReturnValue();
if (pixelData != nullptr)
{
    // Use pixel data (save to file, process, etc.)
    SaveToFile(pixelData, "screenshot.png");
}

// Option 2: Use callback (recommended)
captureOp.DoWhenComplete([](const SPtr<PixelData>& pixelData) {
    if (pixelData != nullptr)
    {
        // Callback executes on main thread when capture completes
        SaveToFile(pixelData, "screenshot.png");
    }
    else
    {
        B3D_LOG(Warning, Renderer, "Frame capture failed");
    }
});

// Option 3: Poll for completion
while (!captureOp.HasCompleted())
{
    // Do other work...
}
SPtr<PixelData> pixelData = captureOp.GetReturnValue();
```

---

## Summary of Changes

### Files Modified

1. **`Framework/Source/Foundation/Core/Components/B3DCamera.h`**
   - Add `RequestCapture()` declaration

2. **`Framework/Source/Foundation/Core/Components/B3DCamera.cpp`**
   - Implement `RequestCapture()` (main thread validation + render thread post)

3. **`Framework/Source/Foundation/Core/Renderer/B3DRenderer.h`**
   - Add `virtual void RequestCapture(render::Camera*, TAsyncOp<SPtr<PixelData>>) = 0`

4. **`Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.h`**
   - Add `RequestCapture()` override declaration

5. **`Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.cpp`**
   - Implement `RequestCapture()` (find view + queue)
   - Modify `RenderView()` to call `ProcessPendingCaptures()`

6. **`Framework/Source/Plugins/bsfRenderBeast/B3DRendererView.h`**
   - Add `PendingCapture` struct
   - Add `mPendingCaptures` queue
   - Add `QueueCapture()` and `ProcessPendingCaptures()` declarations

7. **`Framework/Source/Plugins/bsfRenderBeast/B3DRendererView.cpp`**
   - Implement `QueueCapture()` (queue management)
   - Implement `ProcessPendingCaptures()` (window handling + async GPU read)

### Key Design Principles

- **Encapsulation**: `RendererView` remains private to RenderBeast
- **Async by default**: No GPU stalls, uses `TAsyncOp` pattern
- **Thread safety**: Clear separation between main and render threads
- **Fail fast**: Invalid states return null immediately
- **Minimal coupling**: Uses existing interfaces (`Texture::ReadDataAsync`)

---

## Future Enhancements

1. **Format conversion**: Add optional `PixelFormat` parameter to `RequestCapture()`
2. **Region capture**: Capture sub-rectangle instead of full frame
3. **Mip level selection**: Capture specific mip level
4. **Cancellation**: Ability to cancel pending captures
5. **Priority queue**: Prioritize certain captures over others
6. **Statistics**: Track capture performance metrics
7. **Pooling**: Reuse temporary textures for window captures

---

## References

- Existing `Texture::ReadDataAsync()` implementation: `Framework/Source/Foundation/Core/RenderAPI/B3DTexture.h`
- Async operation pattern: `Framework/Source/Foundation/Utility/Threading/B3DAsyncOp.h`
- Render thread messaging: `Framework/Source/Foundation/Core/CoreObject/B3DRenderThread.h`
- RenderBeast pipeline: `Framework/Source/Plugins/bsfRenderBeast/B3DRenderBeast.cpp`
- Compositor: `Framework/Source/Plugins/bsfRenderBeast/B3DRenderCompositor.h`
