import fs from "fs";
import path from "path";
import { parseClassListCsv } from "../utils/csv";
import { upsertStudents, isUsingLocalFallback } from "../db/repository";

async function main() {
  const candidatePaths = [
    path.resolve(__dirname, "../../../classlist.csv"),
    path.resolve(__dirname, "../../classlist.csv"),
    path.resolve(process.cwd(), "classlist.csv"),
    path.resolve(process.cwd(), "../classlist.csv"),
  ];

  const csvPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!csvPath) {
    console.error("❌ Could not find classlist.csv in project root or backend folder.");
    process.exit(1);
  }

  console.log(`📂 Reading class list from: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf-8");
  const students = parseClassListCsv(content);

  console.log(`⏳ Upserting ${students.length} students into database...`);
  const stats = await upsertStudents(students);

  console.log(`✅ Successfully seeded students!`);
  console.log(`   Total Students : ${stats.total}`);
  console.log(`   Boys (M)       : ${stats.boys}`);
  console.log(`   Girls (F)      : ${stats.girls}`);
  console.log(`   Storage Mode   : ${isUsingLocalFallback() ? "Local Persistent Fallback (.data/local-db.json)" : "Supabase Postgres"}`);
}

main().catch((err) => {
  console.error("❌ Failed to seed students:", err);
  process.exit(1);
});

