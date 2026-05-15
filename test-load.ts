import { classifyIntent } from "./src/lib/ml/intentClassifier";
import Database from 'better-sqlite3';

async function test() {
  console.log("Testing imports...");
  try {
    const db = new Database('test.db');
    console.log("Database loaded.");
  } catch (e) {
    console.error("Database failed", e);
  }
  
  console.log("Loading intent classifier...");
  // This might trigger downloads
  // try {
  //   const res = await classifyIntent("hi");
  //   console.log("Intent result", res);
  // } catch (e) {
  //   console.error("Intent failed", e);
  // }
}

test();
