// import { EventEmitter } from "node:events";

// //! PUSH MECHANISM
// const emitter = new EventEmitter();

// let index = 0;
// function pushEvent() {
//   if (index === 7) return emitter.emit("end");
//   // console.log(index++);
//   const nextIndex = index++;
//   emitter.emit("data", nextIndex);
//   setImmediate(pushEvent);
// }

// function main() {
//   emitter.on("data", (chunk) => {
//     // add large cpu work
//     for (let i = 0; i < 1_00; i++) {
//       // doing heavy cpu work
//       console.log("heavy cpu work round", i + 1);
//     }
//     console.log("chunk", chunk);
//   });
//   emitter.on("end", () => {
//     console.log("stream ended");
//   });
//   pushEvent();
// }

// //! PULL MECHANISM
// let index_2 = 0;
// function pullData() {
//   const iterator = {
//     next(): { done: boolean; value?: any } {
//       if (index_2 >= 10) return { done: true };
//       return { value: index_2++, done: false };
//     },
//     [Symbol.iterator]() {
//       return this;
//     },
//   };

//   let result = iterator.next();
//   while (!result.done) {
//     console.log(result.value);
//     result = iterator.next();
//   }
// }

// //! PULL WITH GENERATORS
// function callPullGenerator(data: any[]) {
//   function* pullGenerator() {
//     for (const val of data) {
//       yield val;
//     }
//   }

//   for (const value of pullGenerator()) {
//     console.log(value);
//   }
// }

// callPullGenerator([1, 2, 3, 4, 5]);
