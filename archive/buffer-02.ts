import { Buffer } from "node:buffer";

/**
 * Make retained-view behavior measurable. A small Buffer view can keep a much larger backing store alive even after the parent variable is gone.

Your Task
Write a program that demonstrates and measures retained backing-store memory. The script should perform two separate tests.

The view test

Allocate a single, large Buffer, for example 50 MiB.
In a loop, create a large number of small views, for example 100,000 views of 16 bytes each, from this large Buffer using buf.subarray().
Store these views in an array so they are not garbage collected.
After the loop, log the memory usage using process.memoryUsage(). Pay close attention to arrayBuffers and external.
The copy test

Allocate a single, large Buffer of the same size, 50 MiB.
In a loop, create a large number of small copies, for example 100,000 copies of 16 bytes each.
Store these copies in an array.
After the loop, make sure the original large Buffer is eligible for garbage collection and, if possible, invoke the GC.
Log the memory usage again.
The Goal

Your script's output should show a clear difference in Buffer backing-store memory between the two tests. The view test's arrayBuffers and external values should stay slightly over 50 MiB because the small views keep the large backing store alive.

The copy test's arrayBuffers value should be much closer to the total copied payload size, though rss may not drop immediately because the native allocator can retain pages.

Things to Consider

Run your script with the --expose-gc flag so you can call global.gc(). This makes the results more stable.
Why are arrayBuffers and external the useful metrics for this experiment?
What do rss and heapUsed represent?
The total size of the copies is 100,000 * 16 bytes = 1,600,000 bytes, about 1.53 MiB. Your result for the copy test should be in this range.
A helper function to format the byte counts into KiB/MiB will make your output easier to read.
 */

function viewTest() {
  global.gc!();
  let buf: any = Buffer.alloc(50 * 1024 * 1024);

  let offset = 0;
  const views: any[] = [];
  for (let i = 0; i < 100_000; i++) {
    const newOffset = offset + 4;
    views.push(buf.subarray(offset, newOffset));
    offset = newOffset;
  }

  buf = null;

  global.gc!();

  console.log(views);
  const memoryUsage: any = process.memoryUsage();

  Object.keys(memoryUsage).forEach((key) => {
    console.log(`ViewsTest==>${key}==>${memoryUsage[key] / (1024 * 1024)}`);
  });
}

function copyTest() {
  global.gc!();
  let buf: any = Buffer.alloc(50 * 1024 * 1024);

  let offset = 0;

  const copies: any[] = [];

  for (let i = 0; i < 100_000; i++) {
    const newOffset = offset + 16;
    copies.push(Buffer.from(buf.subarray(offset, newOffset)));
    offset = newOffset;
  }

  buf = null;

  global.gc!();

  console.log(copies);

  const memoryUsage: any = process.memoryUsage();

  Object.keys(memoryUsage).forEach((key) => {
    console.log(`CopiesTest==>${key}==>${memoryUsage[key] / (1024 * 1024)}`);
  });
}

viewTest();
copyTest();
