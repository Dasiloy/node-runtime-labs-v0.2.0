import { Buffer } from "node:buffer";

/**
 * Your video processing service constantly allocates and frees large 64 KiB Buffers. After running for a few days, it crashes with out-of-memory errors. To reduce that churn, implement a custom application-level Buffer pool.

Your Task
Create a BufferPool class that manages a fixed number of pre-allocated Buffers of a specific size.

The class must have the following features.

Constructor (bufferSize, poolSize)

Takes the size of each Buffer, for example 65,536 bytes, and the number of Buffers to keep in the pool, for example 100.
Pre-allocates all of these Buffers and stores them, perhaps in an array.
Method get()

Returns an available Buffer when the pool has one.
If the pool is empty, logs a warning and allocates a temporary Buffer of the correct size. This prevents the application from crashing but signals that the pool might be too small.
Returns a Buffer.
Method release(buffer)

Takes a Buffer that was previously acquired from the pool.
Returns the Buffer to the pool, making it available for the next get() call.
It must reject Buffers that were not created by the pool.
It must reject double releases.
It should prevent temporary overflow Buffers from being added to the fixed pool.
Property used

A getter that returns the number of Buffers currently checked out from the pool.
The Goal

Write the BufferPool class and then write a small simulation to test it. The simulation should -

Create a pool.
Get several Buffers from it, checking the used count.
Release those Buffers back to the pool.
Test the "pool empty" condition by trying to get more Buffers than the pool size.
Test the release logic for an "extra" Buffer that was created when the pool was empty.
Things to Consider

What is the simplest data structure for available Buffers? An array with push() and pop() is enough for this exercise.
Track ownership explicitly. A same-size Buffer from somewhere else must not pass validation. A Set of pool-owned Buffers plus a Set of currently checked-out Buffers is enough for this exercise.
A regular JavaScript BufferPool instance is not shared mutable state across worker threads. If workers need a common pool, use a main-thread lease protocol with message passing, or design a SharedArrayBuffer allocator with Atomics. A plain array of Buffer objects does not become thread-safe by being passed to workers.
Use try...finally when using this pool so Buffers are released even if errors occur.
 */

const DEF_BUFFER_SIZE = 50 * 1024; // default 50kb
const DEF_POOL_SIZE = 1;

class BufferPool {
  private buf_store: Buffer[] = [];
  private checkedout_store = new Set<Buffer>();

  constructor(
    private readonly bufferSize = DEF_BUFFER_SIZE,
    private readonly poolSize = DEF_POOL_SIZE,
  ) {
    if (bufferSize < 0) {
      this.bufferSize = DEF_BUFFER_SIZE;
    }

    if (poolSize < 0) {
      this.poolSize = DEF_POOL_SIZE;
    }

    this.buf_store = Array.from({ length: this.poolSize }, () =>
      Buffer.alloc(this.bufferSize),
    );
  }

  get() {
    const buf = this.buf_store.pop();
    if (buf === undefined) {
      console.warn(
        `No available buffer space.\nPool size of ${this.poolSize} is too small. Allocating new Buffer`,
      );
      return Buffer.alloc(this.bufferSize);
    }

    console.log("buf", buf);
    this.checkedout_store.add(buf);
    return buf;
  }

  release(buffer: Buffer<ArrayBufferLike>) {
    // was this initially a part of this buffer
    if (!this.checkedout_store.has(buffer)) {
      throw new Error("Invalid buffer, not part of pool!");
    }

    // reset release
    this.checkedout_store.delete(buffer);
    this.buf_store.push(buffer);
  }

  get used() {
    return this.checkedout_store.size;
  }
}

const buf_pool = new BufferPool();
console.log(buf_pool.used);
const in_range = buf_pool.get();
console.log(buf_pool.used);
const out_of_range = buf_pool.get();
console.log(buf_pool.used);
buf_pool.release(in_range);
console.log(buf_pool.used);
try {
  buf_pool.release(Buffer.from([0x56, 0x77]));
} catch (error) {
  console.error(error);
}
console.log(buf_pool.used);
