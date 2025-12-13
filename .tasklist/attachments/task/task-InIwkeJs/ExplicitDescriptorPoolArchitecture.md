# Explicit Descriptor Pool Architecture

## Document Information
- **Author**: Architecture Design
- **Target**: Banshee 3D Engine - Vulkan Render Backend
- **Status**: Design Proposal
- **Date**: 2024

---

## 1. Executive Summary

This document describes an **explicit** descriptor pool management architecture where:
1. Users **explicitly create** descriptor pools per-thread and per-frame
2. Users **allocate GpuParameterSet** objects directly from pools (not from GpuDevice)
3. Users **handle synchronization** externally
4. Transient pools are reset each frame; persistent pools survive across frames

### Key Design Principles
- **Explicit over implicit**: No hidden pool management; users create and manage pools
- **No internal locking**: Pools are not thread-safe; users synchronize externally
- **Per-frame recycling**: Transient pools support O(1) bulk reset via `vkResetDescriptorPool`
- **Direct allocation**: GpuParameterSet allocated from pools, not from GpuDevice
- **Single pool class**: One `VulkanDescriptorPool` with transient/persistent mode
- **Single parameter set class**: Standard `VulkanGpuParameterSet` for all allocations

---

## 2. Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                              VulkanGpuDevice                                      |
|                                                                                   |
|  +---------------------------+  +------------------------------------------+      |
|  | DescriptorLayoutCache     |  | PipelineLayoutCache                      |      |
|  | (Thread-safe, immutable)  |  | (Thread-safe, immutable)                 |      |
|  +---------------------------+  +------------------------------------------+      |
|                                                                                   |
|  CreateDescriptorPool(mode) ------> Returns VulkanDescriptorPool*                 |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|                         User-Managed Pool Hierarchy                               |
|                                                                                   |
|  Render Thread                    Worker Thread 1              Worker Thread N    |
|  +------------------------+       +------------------------+   +---------------+  |
|  | PoolRing (Transient)   |       | PoolRing (Transient)   |   | ...           |  |
|  | [Frame 0] [Frame 1]    |       | [Frame 0] [Frame 1]    |   |               |  |
|  | [Frame 2]              |       | [Frame 2]              |   |               |  |
|  +------------------------+       +------------------------+   +---------------+  |
|                                                                                   |
|  Persistent Pools (user-managed, for long-lived GpuParameterSets)                |
|  +------------------------+                                                       |
|  | Pool (Persistent)      |                                                       |
|  +------------------------+                                                       |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|                            Allocation Flow                                        |
|                                                                                   |
|  VulkanDescriptorPool::AllocateParameterSet(layout, set)                         |
|       |                                                                           |
|       v                                                                           |
|  Returns: VulkanGpuParameterSet* (same class for both modes)                      |
+-----------------------------------------------------------------------------------+
```

---

## 3. GpuDescriptorPool (Base API)

### 3.1 Pool Modes

The pool operates in one of two modes, specified at creation:

| Mode | Reset Support | Individual Free | Use Case |
|------|---------------|-----------------|----------|
| **Transient** | Yes (O(1)) | No | Per-frame allocations |
| **Persistent** | No | Yes | Long-lived allocations |

### 3.2 Base Class Definition (Core RenderAPI)

Located in `Framework/Source/Foundation/Core/RenderAPI/B3DGpuDescriptorPool.h`:

```cpp
/**
 * Abstract descriptor pool for explicit user-managed allocation.
 *
 * Supports two modes:
 * - Transient: Bulk reset via Reset(), no individual free
 * - Persistent: Individual set deallocation, no bulk reset
 *
 * Thread Safety: NOT thread-safe. User must ensure single-threaded access
 * or provide external synchronization.
 *
 * Typical Usage (Transient):
 *   // Per-thread, per-frame:
 *   pool->Reset();  // Start of frame (invalidates all previous allocations)
 *   auto paramSet = pool->AllocateParameterSet(layout, setIndex);
 *   paramSet->SetUniformBuffer(0, buffer);
 *   // Use paramSet during this frame only
 *
 * Typical Usage (Persistent):
 *   // During initialization:
 *   auto paramSet = pool->AllocateParameterSet(layout, setIndex);
 *   paramSet->SetSampledTexture(0, texture);
 *   // paramSet lives until pool destroyed or explicitly freed
 */
class B3D_EXPORT GpuDescriptorPool
{
public:
	/** Pool operating mode. */
	enum class Mode
	{
		/**
		 * Transient mode for per-frame allocations.
		 * - Supports O(1) bulk reset via Reset()
		 * - No individual set deallocation
		 * - Vulkan: Created WITHOUT VK_DESCRIPTOR_POOL_CREATE_FREE_DESCRIPTOR_SET_BIT
		 */
		Transient,

		/**
		 * Persistent mode for long-lived allocations.
		 * - Supports individual set deallocation
		 * - No bulk reset
		 * - Vulkan: Created WITH VK_DESCRIPTOR_POOL_CREATE_FREE_DESCRIPTOR_SET_BIT
		 */
		Persistent
	};

	/**
	 * Pool capacity configuration.
	 * Default values based on typical usage requirements.
	 */
	struct Capacity
	{
		u32 MaxSets = 4096;
		u32 MaxSampledImages = 2048;
		u32 MaxSamplers = 2048;
		u32 MaxCombinedImageSamplers = 2048;
		u32 MaxUniformBuffers = 1024;
		u32 MaxUniformBuffersDynamic = 1024;
		u32 MaxStorageImages = 1024;
		u32 MaxUniformTexelBuffers = 1024;
		u32 MaxStorageTexelBuffers = 1024;
		u32 MaxStorageBuffers = 1024;
		u32 MaxStorageBuffersDynamic = 1024;

		static Capacity Default() { return Capacity{}; }
		static Capacity Large();   /**< 2x default capacity. */
		static Capacity Small();   /**< 0.5x default capacity. */
	};

	virtual ~GpuDescriptorPool() = default;

	// Non-copyable, non-movable
	GpuDescriptorPool(const GpuDescriptorPool&) = delete;
	GpuDescriptorPool& operator=(const GpuDescriptorPool&) = delete;

	/**
	 * Allocates a GpuParameterSet from this pool.
	 *
	 * Lifetime depends on pool mode:
	 * - Transient: Valid until Reset() is called
	 * - Persistent: Valid until explicitly freed or pool destroyed
	 *
	 * @param layout    Pipeline parameter set layout.
	 * @param setIndex  Set index within the pipeline.
	 * @return          Parameter set, or nullptr if pool exhausted.
	 *
	 * @note NOT thread-safe.
	 */
	virtual SPtr<render::GpuParameterSet> AllocateParameterSet(
		const SPtr<GpuPipelineParameterSetLayout>& layout,
		u32 setIndex) = 0;

	/**
	 * Resets the pool, invalidating ALL previous allocations.
	 *
	 * After this call:
	 * - All SPtr<GpuParameterSet> from this pool are invalid (dangling)
	 * - Pool is ready for new allocations
	 *
	 * @note Only valid for Transient mode. Asserts in Persistent mode.
	 * @note Caller must ensure no references to allocated sets are used after reset.
	 */
	virtual void Reset() = 0;

	/**
	 * Frees an individual parameter set.
	 *
	 * @param paramSet  Parameter set to free (must be from this pool).
	 *
	 * @note Only valid for Persistent mode. Asserts in Transient mode.
	 */
	virtual void Free(const SPtr<render::GpuParameterSet>& paramSet) = 0;

	/** Returns the pool's operating mode. */
	Mode GetMode() const { return mMode; }

	/** Returns true if operating in transient mode. */
	bool IsTransient() const { return mMode == Mode::Transient; }

	/** Returns true if operating in persistent mode. */
	bool IsPersistent() const { return mMode == Mode::Persistent; }

	/** Returns true if the pool likely has capacity for more allocations. */
	bool HasCapacity() const { return mAllocatedSetCount < mCapacity.MaxSets; }

	/** Returns the number of currently allocated sets. */
	u32 GetAllocatedSetCount() const { return mAllocatedSetCount; }

	/** Returns the maximum number of sets this pool can hold. */
	u32 GetMaxSetCount() const { return mCapacity.MaxSets; }

	/** Returns allocation statistics. */
	struct Statistics
	{
		u32 AllocatedSets;
		u32 MaxSets;
		u32 OverflowCount;  /**< Times allocation failed due to capacity. */
		u32 ResetCount;     /**< Number of times Reset() was called. */
	};
	virtual Statistics GetStatistics() const;

protected:
	GpuDescriptorPool(Mode mode, const Capacity& capacity);

	Mode mMode;
	Capacity mCapacity;
	u32 mAllocatedSetCount = 0;
	u32 mOverflowCount = 0;
	u32 mResetCount = 0;
};
```

---

## 4. VulkanDescriptorPool (Vulkan Implementation)

Located in `Framework/Source/Plugins/bsfVulkanRenderAPI/B3DVulkanDescriptorPool.h`:

```cpp
/**
 * Vulkan implementation of GpuDescriptorPool.
 */
class VulkanDescriptorPool : public GpuDescriptorPool
{
public:
	/**
	 * Creates a Vulkan descriptor pool with specified mode and capacity.
	 *
	 * @param device    GPU device.
	 * @param mode      Operating mode (Transient or Persistent).
	 * @param capacity  Pool capacity configuration.
	 */
	VulkanDescriptorPool(VulkanGpuDevice& device, Mode mode, const Capacity& capacity = Capacity::Default());
	~VulkanDescriptorPool() override;

	SPtr<render::GpuParameterSet> AllocateParameterSet(
		const SPtr<GpuPipelineParameterSetLayout>& layout,
		u32 setIndex) override;

	void Reset() override;
	void Free(const SPtr<render::GpuParameterSet>& paramSet) override;
	Statistics GetStatistics() const override;

	/** Returns the Vulkan pool handle. */
	VkDescriptorPool GetVulkanHandle() const { return mPool; }

	/**
	 * Allocates a raw descriptor set (for advanced Vulkan-specific use cases).
	 *
	 * @param layout    Vulkan descriptor set layout.
	 * @return          VkDescriptorSet handle, or VK_NULL_HANDLE if exhausted.
	 */
	VkDescriptorSet AllocateRawSet(VkDescriptorSetLayout layout);

private:
	VulkanGpuDevice& mDevice;
	VkDescriptorPool mPool = VK_NULL_HANDLE;
};
```

---

## 5. GpuParameterSet Changes

The existing `GpuParameterSet` class is used for both transient and persistent allocations. Key modifications:

### 5.1 Pool Association (Base Class)

```cpp
class B3D_EXPORT GpuParameterSet
{
public:
	// ... existing interface unchanged ...

	/**
	 * Returns the pool this parameter set was allocated from.
	 * May be nullptr for legacy allocations via GpuDevice.
	 */
	GpuDescriptorPool* GetOwnerPool() const { return mOwnerPool; }

protected:
	// New: Track owning pool
	GpuDescriptorPool* mOwnerPool = nullptr;
};
```

### 5.2 Vulkan Implementation

```cpp
class VulkanGpuParameterSet : public GpuParameterSet
{
protected:
	// Constructor for pool-based allocation
	VulkanGpuParameterSet(
		VulkanGpuDevice& gpuDevice,
		VulkanDescriptorPool& pool,
		VkDescriptorSet set,
		const SPtr<GpuPipelineParameterSetLayout>& parameterSetLayout,
		u32 setIndex);
};
```

### 5.3 Allocation Implementation

```cpp
SPtr<render::GpuParameterSet> VulkanDescriptorPool::AllocateParameterSet(
	const SPtr<GpuPipelineParameterSetLayout>& layout,
	u32 setIndex)
{
	VulkanGpuPipelineParameterSetLayout& vkLayout =
		static_cast<VulkanGpuPipelineParameterSetLayout&>(*layout);

	VkDescriptorSetLayout setLayout = vkLayout.GetLayout()->GetVulkanHandle();
	VkDescriptorSet set = AllocateRawSet(setLayout);

	if (set == VK_NULL_HANDLE)
		return nullptr;

	++mAllocatedSetCount;

	// Create parameter set with custom destructor for pool tracking
	auto paramSet = B3DMakeSharedFromExisting(
		new (B3DAllocate<VulkanGpuParameterSet>()) VulkanGpuParameterSet(
			mDevice, *this, set, layout, setIndex));

	return paramSet;
}
```

---

## 6. User-Side Pool Management

### 6.1 DescriptorPoolRing Helper

Users can create their own ring buffer of transient pools:

```cpp
/**
 * Example user-side helper for managing per-frame transient pools.
 *
 * This is NOT part of the engine - just a pattern users can follow.
 */
class DescriptorPoolRing
{
public:
	DescriptorPoolRing(GpuDevice& device)
		: mDevice(device)
	{
		for (u32 frameIndex = 0; frameIndex < RenderThread::kMaximumFramesInFlight; ++frameIndex)
			mPools[frameIndex] = device.CreateDescriptorPool(GpuDescriptorPool::Mode::Transient);
	}

	/**
	 * Returns the pool for the current frame.
	 *
	 * @param frameIndex    Current frame index (0 to kMaximumFramesInFlight-1).
	 */
	GpuDescriptorPool* GetCurrentPool(u32 frameIndex)
	{
		return mPools[frameIndex].get();
	}

	/**
	 * Resets the pool for the current frame.
	 * Call this at the start of each frame.
	 *
	 * @param currentFrameIndex The frame index being started.
	 */
	void OnFrameStart(u32 currentFrameIndex)
	{
		// Reset the pool that will be used this frame
		// (GPU work from kMaximumFramesInFlight frames ago has completed)
		mPools[currentFrameIndex]->Reset();
	}

private:
	GpuDevice& mDevice;
	Array<UPtr<GpuDescriptorPool>, RenderThread::kMaximumFramesInFlight> mPools;
};
```

### 6.2 Per-Thread Pool Pattern

```cpp
/**
 * Example: Per-thread transient pool management.
 */
class ThreadLocalPoolManager
{
public:
	ThreadLocalPoolManager(GpuDevice& device)
		: mDevice(device)
	{}

	/**
	 * Gets or creates the pool ring for the current thread.
	 *
	 * Thread Safety: This method IS thread-safe (uses mutex for creation only).
	 * The returned DescriptorPoolRing is owned by the calling thread and NOT thread-safe.
	 */
	DescriptorPoolRing& GetThreadLocalRing()
	{
		thread_local DescriptorPoolRing* tlsRing = nullptr;

		if (tlsRing == nullptr)
		{
			Lock lock(mMutex);
			auto& ring = mThreadRings[B3D_CURRENT_THREAD_ID];
			if (!ring)
				ring = B3DMakeUnique<DescriptorPoolRing>(mDevice);
			tlsRing = ring.get();
		}

		return *tlsRing;
	}

	/**
	 * Resets all thread pools for the specified frame.
	 * Call from render thread at frame start.
	 *
	 * @note NOT thread-safe with GetThreadLocalRing().
	 *       Only call when worker threads are not allocating.
	 */
	void OnFrameStart(u32 currentFrameIndex)
	{
		Lock lock(mMutex);
		for (auto& [threadId, ring] : mThreadRings)
			ring->OnFrameStart(currentFrameIndex);
	}

private:
	GpuDevice& mDevice;
	Mutex mMutex;
	UnorderedMap<ThreadId, UPtr<DescriptorPoolRing>> mThreadRings;
};
```

---

## 7. GpuDevice API Changes

### 7.1 Base Class Factory Method

```cpp
class B3D_EXPORT GpuDevice
{
public:
	// ... existing methods ...

	/**
	 * Creates a descriptor pool with the specified mode.
	 *
	 * The pool is owned by the caller and must be destroyed before the device.
	 *
	 * @param mode      Operating mode (Transient or Persistent).
	 * @param capacity  Pool capacity (use defaults for typical usage).
	 * @return          Owned descriptor pool.
	 */
	virtual UPtr<GpuDescriptorPool> CreateDescriptorPool(
		GpuDescriptorPool::Mode mode,
		const GpuDescriptorPool::Capacity& capacity = GpuDescriptorPool::Capacity::Default()) = 0;
};
```

### 7.2 Vulkan Implementation

```cpp
class VulkanGpuDevice : public GpuDevice
{
public:
	UPtr<GpuDescriptorPool> CreateDescriptorPool(
		GpuDescriptorPool::Mode mode,
		const GpuDescriptorPool::Capacity& capacity) override;

	// Existing method - kept for backward compatibility but deprecated
	[[deprecated("Use CreateDescriptorPool() instead")]]
	VulkanDescriptorManager& GetDescriptorManager();
};
```

### 7.3 Layout Cache (Remains in Device)

The descriptor set layout cache remains thread-safe and centralized:

```cpp
class VulkanGpuDevice
{
public:
	/**
	 * Gets or creates a descriptor set layout.
	 *
	 * @note Thread-safe.
	 */
	VulkanDescriptorLayout* GetDescriptorLayout(TArrayView<VkDescriptorSetLayoutBinding> bindings);

	/**
	 * Gets or creates a pipeline layout.
	 *
	 * @note Thread-safe.
	 */
	VkPipelineLayout GetPipelineLayout(VulkanDescriptorLayout** layouts, u32 count);

private:
	// Thread-safe layout caches (unchanged from current VulkanDescriptorManager)
	Mutex mLayoutCacheMutex;
	UnorderedSet<VulkanLayoutKey> mLayoutCache;

	Mutex mPipelineLayoutCacheMutex;
	UnorderedMap<VulkanPipelineLayoutKey, VkPipelineLayout> mPipelineLayoutCache;
};
```

---

## 8. Usage Examples

### 8.1 Per-Frame Rendering (Typical Use Case)

```cpp
// Setup (once per thread)
class WorkerThreadContext
{
	DescriptorPoolRing mPoolRing;
	u32 mCurrentFrameIndex = 0;

public:
	WorkerThreadContext(GpuDevice& device)
		: mPoolRing(device)
	{}

	void BeginFrame(u32 frameIndex)
	{
		mCurrentFrameIndex = frameIndex;
		mPoolRing.OnFrameStart(frameIndex);
	}

	GpuDescriptorPool* GetCurrentPool()
	{
		return mPoolRing.GetCurrentPool(mCurrentFrameIndex);
	}
};

// Rendering loop
void RenderObject(WorkerThreadContext& ctx, const RenderableObject& obj,
                  VulkanGpuCommandBuffer& cmdBuffer)
{
	GpuDescriptorPool* pool = ctx.GetCurrentPool();

	// Allocate parameter set for this draw call
	SPtr<render::GpuParameterSet> paramSet = pool->AllocateParameterSet(obj.Material->GetLayout(), 0);

	// Configure bindings
	paramSet->SetUniformBuffer(0, obj.TransformBuffer);
	paramSet->SetSampledTexture(0, obj.Material->GetAlbedoTexture());
	paramSet->SetSamplerState(0, obj.Material->GetSampler());

	// Prepare and bind (Vulkan-specific cast for low-level access)
	auto* vkParamSet = static_cast<VulkanGpuParameterSet*>(paramSet.get());
	VkDescriptorSet set;
	TInlineArray<u32, 4> dynamicOffsets;
	vkParamSet->PrepareForBind(cmdBuffer, resourceTracker, barrierHelper, set, dynamicOffsets);

	vkCmdBindDescriptorSets(cmdBuffer.GetVulkanHandle(), VK_PIPELINE_BIND_POINT_GRAPHICS,
		pipelineLayout, 0, 1, &set, dynamicOffsets.Size(), dynamicOffsets.Data());

	// Draw
	vkCmdDrawIndexed(cmdBuffer.GetVulkanHandle(), obj.IndexCount, 1, 0, 0, 0);
}
```

### 8.2 Persistent Material Setup

```cpp
class Material
{
	SPtr<render::GpuParameterSet> mParameterSet;

public:
	void Initialize(GpuDescriptorPool& pool,
	                const SPtr<GpuPipelineParameterSetLayout>& layout)
	{
		// Allocate from persistent pool
		mParameterSet = pool.AllocateParameterSet(layout, 0);

		// Configure (these survive across frames)
		mParameterSet->SetSampledTexture(0, mAlbedoTexture);
		mParameterSet->SetSamplerState(0, mSampler);
	}

	void Destroy(GpuDescriptorPool& pool)
	{
		if (mParameterSet)
		{
			pool.Free(mParameterSet);
			mParameterSet = nullptr;
		}
	}

	const SPtr<render::GpuParameterSet>& GetParameterSet() const { return mParameterSet; }
};
```

### 8.3 Mixed Transient + Persistent

```cpp
void RenderWithPerObjectData(
	WorkerThreadContext& ctx,
	const Material& material,
	const PerObjectData& perObjectData,
	VulkanGpuCommandBuffer& cmdBuffer)
{
	// Set 0: Material data (persistent, from material)
	// Already configured, just bind

	// Set 1: Per-object data (transient, from pool)
	SPtr<render::GpuParameterSet> perObjectSet = ctx.GetCurrentPool()->AllocateParameterSet(
		perObjectData.Layout, 1);
	perObjectSet->SetUniformBuffer(0, perObjectData.TransformBuffer);

	// Bind both sets (Vulkan-specific)
	VkDescriptorSet sets[2];

	// Material set (persistent)
	auto* vkMaterialSet = static_cast<VulkanGpuParameterSet*>(material.GetParameterSet().get());
	TInlineArray<u32, 4> materialOffsets;
	vkMaterialSet->PrepareForBind(cmdBuffer, resourceTracker, barrierHelper,
		sets[0], materialOffsets);

	// Per-object set (transient)
	auto* vkPerObjectSet = static_cast<VulkanGpuParameterSet*>(perObjectSet.get());
	TInlineArray<u32, 4> perObjectOffsets;
	vkPerObjectSet->PrepareForBind(cmdBuffer, resourceTracker, barrierHelper,
		sets[1], perObjectOffsets);

	// Combine dynamic offsets
	TInlineArray<u32, 8> allOffsets;
	for (u32 offset : materialOffsets)
		allOffsets.Add(offset);
	for (u32 offset : perObjectOffsets)
		allOffsets.Add(offset);

	vkCmdBindDescriptorSets(cmdBuffer.GetVulkanHandle(),
		VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout,
		0, 2, sets, allOffsets.Size(), allOffsets.Data());
}
```

---

## 9. Synchronization Responsibility

### 9.1 User Responsibilities

| Scenario | User Must Ensure |
|----------|------------------|
| Pool allocation | Single-threaded access to pool during allocation |
| Parameter set configuration | Single-threaded access during Set*() calls |
| Pool reset | No allocations in progress; GPU work using sets is complete |
| Cross-thread sharing | External synchronization (mutex, atomic, etc.) |

### 9.2 Engine Guarantees

| Component | Thread Safety |
|-----------|---------------|
| Layout cache (GetDescriptorLayout) | Thread-safe |
| Pipeline layout cache (GetPipelineLayout) | Thread-safe |
| Pool creation (CreateDescriptorPool) | Thread-safe |
| Pool operations (Allocate, Reset, Free) | NOT thread-safe |
| GpuParameterSet operations | NOT thread-safe |

### 9.3 Typical Thread Model

```
Main Thread                 Worker Threads           GPU
-----------                 --------------           ---

Frame N:
  OnFrameStart(N)
  Reset pools for frame N
                            Allocate from pool N
                            Configure sets
                            Record command buffers
  Submit command buffers
                                                     Execute Frame N

Frame N+1:
  OnFrameStart(N+1)
  Reset pools for frame N+1
  (Pool N still in use by GPU)
                            Allocate from pool N+1
                            ...
```

---

## 10. Comparison with Previous Design

| Aspect | Previous Design | This Design |
|--------|-----------------|-------------|
| Pool creation | Automatic (hidden) | Explicit (user-created) |
| Pool ownership | Manager owns pools | User owns pools |
| Thread safety | Manager handles internally | User handles externally |
| GpuParameterSet allocation | From GpuDevice | From Pool |
| Frame tracking | Automatic via AdvanceFrame() | User manages frame index |
| Synchronization | Internal mutex | No internal locking |
| Pool classes | Vulkan-only | Base API + Vulkan impl |
| Return type | Raw pointer | SPtr<GpuParameterSet> |
| Flexibility | Limited | Full control |
| Complexity | Lower (automatic) | Higher (explicit) |

---

## 11. Migration Path

### Phase 1: Add Base API

1. Create `GpuDescriptorPool` base class in Core/RenderAPI
2. Update `VulkanDescriptorPool` to inherit from base
3. Add `CreateDescriptorPool()` to `GpuDevice` base class
4. Implement in `VulkanGpuDevice`
5. Keep existing `VulkanDescriptorManager` unchanged

### Phase 2: Update Renderer

1. Create `DescriptorPoolRing` helper in renderer
2. Migrate per-frame allocations to transient pools
3. Migrate persistent allocations to persistent pools

### Phase 3: Deprecate Old System

1. Mark `GetDescriptorManager()` as deprecated
2. Migrate remaining users
3. Remove old `VulkanDescriptorManager`

---

## 12. Performance Considerations

### 12.1 Allocation Cost

| Operation | Cost | Notes |
|-----------|------|-------|
| Pool::AllocateParameterSet (Transient) | O(1) | vkAllocateDescriptorSets |
| Pool::Reset (Transient) | O(1) | Single vkResetDescriptorPool |
| Pool::AllocateParameterSet (Persistent) | O(1) | vkAllocateDescriptorSets |
| Pool::Free (Persistent) | O(1) | vkFreeDescriptorSets |
| Layout lookup (cache hit) | O(1) | Hash table lookup |
| Layout creation (cache miss) | O(n) | Vulkan call + cache insert |

### 12.2 Memory Usage

- Pool (default capacity): ~2MB per pool (configurable)
- Per-thread with 3 frames: ~6MB per thread
- 4 worker threads: ~24MB total for transient pools

### 12.3 No Lock Contention

Since pools are not thread-safe and users are expected to use per-thread pools, there is **zero lock contention** during allocation. The only synchronization points are:
- Layout cache (rare, read-mostly)
- Pool creation (once per thread per frame ring)

---

## 13. Appendix: File Structure

New files:
- `Framework/Source/Foundation/Core/RenderAPI/B3DGpuDescriptorPool.h` (base class)
- `Framework/Source/Foundation/Core/RenderAPI/B3DGpuDescriptorPool.cpp`

Updated files:
- `Framework/Source/Plugins/bsfVulkanRenderAPI/B3DVulkanDescriptorPool.h/.cpp` (inherits base)
- `Framework/Source/Foundation/Core/RenderAPI/B3DGpuParameterSet.h` (add pool association)
- `Framework/Source/Plugins/bsfVulkanRenderAPI/B3DVulkanGpuParameterSet.h/.cpp`
- `Framework/Source/Foundation/Core/RenderAPI/B3DGpuDevice.h` (add factory method)
- `Framework/Source/Plugins/bsfVulkanRenderAPI/B3DVulkanGpuDevice.h/.cpp`

---

## 14. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024 | Architecture | Initial explicit pool design |
| 1.1 | 2024 | Architecture | Unified to single pool class with Mode enum |
| 1.2 | 2024 | Architecture | Added base GpuDescriptorPool class, SPtr return type |
