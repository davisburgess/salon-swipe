// Sweeps the taste model's learning settings on the simulation lab's "model only" experiment.
import { CFG } from "../alpha/js/model.js";
process.argv[2] = process.argv[2] || "400"; process.argv[3] = "2";
const grid = JSON.parse(process.env.GRID || "[{}]");
const { runModelOnly } = await import("./reco-sim.mjs");
const base = { ...CFG };
for (const g of grid) {
  Object.assign(CFG, base, g);
  const r = runModelOnly();
  console.log(JSON.stringify(g).padEnd(60), `AUC ${r.auc.toFixed(3)}  logloss ${r.ll.toFixed(3)}  oracle AUC ${r.oracle.toFixed(3)}`);
}
