import fs from "fs";
import path from "path";

interface CliOptions {
  api: string;
  email: string;
  password: string;
}

function parseCliArgs(argv: string[]): CliOptions {
  let api = (process.env.SMOKE_API_URL || "http://localhost:4000").trim();
  let email = (process.env.SMOKE_ADMIN_EMAIL || "").trim();
  let password = process.env.SMOKE_ADMIN_PASSWORD || "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--api" && argv[i + 1]) {
      api = argv[++i];
    } else if (arg.startsWith("--api=")) {
      api = arg.slice("--api=".length);
    } else if (arg === "--email" && argv[i + 1]) {
      email = argv[++i];
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else if (arg === "--password" && argv[i + 1]) {
      password = argv[++i];
    } else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    }
  }

  api = api.trim().replace(/\/+$/, "");
  email = email.trim().toLowerCase();

  if (!api || !email || !password) {
    console.error(
      "Usage: npm run smoke-test -- --api <base url> --email <admin email> --password <password>"
    );
    process.exit(1);
  }

  return { api, email, password };
}

interface StepResult {
  step: string;
  passed: boolean;
  detail: string;
}

export async function runSmokeTest(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { api, email, password } = parseCliArgs(argv);
  const results: StepResult[] = [];
  const createdFormIds: string[] = [];
  let token = "";

  const logStep = (step: string, passed: boolean, detail: string) => {
    results.push({ step, passed, detail });
    console.log(`[${passed ? "PASS" : "FAIL"}] ${step} — ${detail}`);
  };

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
  });

  const jsonHeaders = (withAuth = false): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(withAuth ? authHeaders() : {}),
  });

  try {
    // 1. Check /health
    {
      const res = await fetch(`${api}/health`);
      const body: any = await res.json().catch(() => null);
      const ok = res.status === 200 && body?.ok === true;
      logStep(
        "GET /health",
        ok,
        ok ? "Status 200, { ok: true }" : `Expected 200 { ok: true }, got ${res.status}`
      );
      if (!ok) throw new Error("Health check failed");
    }

    // 2. Admin login
    {
      const res = await fetch(`${api}/api/admin/login`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({ email, password }),
      });
      const body: any = await res.json().catch(() => null);
      const ok = res.status === 200 && typeof body?.token === "string" && body.token.length > 0;
      if (ok) {
        token = body.token;
      }
      logStep(
        "POST /api/admin/login",
        ok,
        ok
          ? `Authenticated as ${body.admin?.email || email} (${body.admin?.role || "admin"})`
          : `Login failed with status ${res.status}: ${body?.message || "Unknown error"}`
      );
      if (!ok) throw new Error("Admin login failed");
    }

    // Ensure class roster has at least 6 students to use for test submissions
    let students: { roll_no: string; name: string; gender: "M" | "F" }[] = [];
    {
      const stuRes = await fetch(`${api}/api/admin/students`, {
        headers: authHeaders(),
      });
      const stuBody: any = await stuRes.json().catch(() => null);
      students = Array.isArray(stuBody?.students) ? stuBody.students : [];

      if (students.length < 6) {
        const candidatePaths = [
          path.resolve(__dirname, "../../classlist.csv"),
          path.resolve(__dirname, "../classlist.csv"),
        ];
        const csvPath = candidatePaths.find((p) => fs.existsSync(p));
        const csvText = csvPath
          ? fs.readFileSync(csvPath, "utf-8")
          : "roll_no,name,gender\n23Z201,TEST STUDENT 1,M\n23Z202,TEST STUDENT 2,F\n23Z203,TEST STUDENT 3,M\n23Z204,TEST STUDENT 4,F\n23Z205,TEST STUDENT 5,M\n23Z206,TEST STUDENT 6,F\n23Z207,TEST STUDENT 7,M\n";

        const form = new FormData();
        form.append("file", new Blob([csvText], { type: "text/csv" }), "classlist.csv");
        await fetch(`${api}/api/admin/students/upload`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });

        const retryRes = await fetch(`${api}/api/admin/students`, { headers: authHeaders() });
        const retryBody: any = await retryRes.json().catch(() => null);
        students = Array.isArray(retryBody?.students) ? retryBody.students : [];
      }
    }

    if (students.length < 6) {
      logStep("Ensure student roster", false, `Need at least 6 students, found ${students.length}`);
      throw new Error("Insufficient students in roster for smoke test");
    }

    const testStudents = students.slice(0, 7);
    const runSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // 3. Create first test form (min 2, max 3, topic off)
    let form1Id = "";
    let form1Slug = "";
    {
      const slug1 = `smoke-notopic-${runSuffix}`;
      const res = await fetch(`${api}/api/admin/forms`, {
        method: "POST",
        headers: jsonHeaders(true),
        body: JSON.stringify({
          title: `Smoke Test Form 1 (${runSuffix})`,
          description: "Automated smoke test form (topic off)",
          slug: slug1,
          min_team_size: 2,
          max_team_size: 3,
          collect_topic: false,
          allow_topic_repeat: true,
          is_open: true,
        }),
      });
      const body: any = await res.json().catch(() => null);
      const f = body?.form;
      const ok =
        res.status === 201 &&
        Boolean(f?.id) &&
        f.min_team_size === 2 &&
        f.max_team_size === 3 &&
        f.collect_topic === false;

      if (f?.id) {
        form1Id = f.id;
        form1Slug = f.slug;
        createdFormIds.push(f.id);
      }

      logStep(
        "Create Form 1 (min 2, max 3, topic off)",
        ok,
        ok
          ? `Created slug='${form1Slug}' (min=${f.min_team_size}, max=${f.max_team_size}, collect_topic=${f.collect_topic})`
          : `Failed (${res.status}): ${body?.message || "Unexpected response"}`
      );
      if (!ok) throw new Error("Failed to create Form 1");
    }

    // 4. Create second test form (min 2, max 3, topics on, repeat off)
    let form2Id = "";
    let form2Slug = "";
    {
      const slug2 = `smoke-topic-${runSuffix}`;
      const res = await fetch(`${api}/api/admin/forms`, {
        method: "POST",
        headers: jsonHeaders(true),
        body: JSON.stringify({
          title: `Smoke Test Form 2 (${runSuffix})`,
          description: "Automated smoke test form (topics on, repeat off)",
          slug: slug2,
          min_team_size: 2,
          max_team_size: 3,
          collect_topic: true,
          allow_topic_repeat: false,
          is_open: true,
        }),
      });
      const body: any = await res.json().catch(() => null);
      const f = body?.form;
      const ok =
        res.status === 201 &&
        Boolean(f?.id) &&
        f.min_team_size === 2 &&
        f.max_team_size === 3 &&
        f.collect_topic === true &&
        f.allow_topic_repeat === false;

      if (f?.id) {
        form2Id = f.id;
        form2Slug = f.slug;
        createdFormIds.push(f.id);
      }

      logStep(
        "Create Form 2 (topics on, repeat off)",
        ok,
        ok
          ? `Created slug='${form2Slug}' (collect_topic=${f.collect_topic}, allow_topic_repeat=${f.allow_topic_repeat})`
          : `Failed (${res.status}): ${body?.message || "Unexpected response"}`
      );
      if (!ok) throw new Error("Failed to create Form 2");
    }

    // 5. Upload tiny topics CSV to Form 2
    {
      const tinyCsv = "topic\nAlpha Distributed Systems\nBeta Compiler Design\nGamma Quantum Computing\n";
      const fd = new FormData();
      fd.append("file", new Blob([tinyCsv], { type: "text/csv" }), "topics.csv");

      const res = await fetch(`${api}/api/admin/forms/${encodeURIComponent(form2Id)}/topics/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const body: any = await res.json().catch(() => null);
      const ok = res.status === 200 && body?.ok === true && body?.uploaded === 3;
      logStep(
        "Upload tiny topics CSV",
        ok,
        ok
          ? `Uploaded ${body.uploaded} topics to Form 2`
          : `Failed (${res.status}): ${body?.message || "Unexpected response"}`
      );
      if (!ok) throw new Error("Topics CSV upload failed");
    }

    // 6. Submit two teams on Form 2 (Team 1 with 2 members, Team 2 with 3 members)
    const team1Students = [testStudents[0], testStudents[1]];
    const team2Students = [testStudents[2], testStudents[3], testStudents[4]];
    const spareStudents = [testStudents[5], testStudents[6] || testStudents[0]];

    {
      const res1 = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: team1Students.map((s) => s.roll_no),
          topic: "Alpha Distributed Systems",
        }),
      });
      const body1: any = await res1.json().catch(() => null);

      const res2 = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: team2Students.map((s) => s.roll_no),
          topic: "Beta Compiler Design",
        }),
      });
      const body2: any = await res2.json().catch(() => null);

      const ok =
        res1.status === 201 &&
        body1?.teamNo === 1 &&
        res2.status === 201 &&
        body2?.teamNo === 2;

      logStep(
        "Submit two teams",
        ok,
        ok
          ? `Submitted Team #${body1.teamNo} (${team1Students.length} members) and Team #${body2.teamNo} (${team2Students.length} members)`
          : `Team1 status=${res1.status} (${body1?.message || "ok"}), Team2 status=${res2.status} (${body2?.message || "ok"})`
      );
      if (!ok) throw new Error("Failed to submit two teams");
    }

    // 7. Confirm a repeated roll number returns 409
    {
      const res = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: [team1Students[0].roll_no, spareStudents[0].roll_no],
          topic: "Gamma Quantum Computing",
        }),
      });
      const body: any = await res.json().catch(() => null);
      const ok = res.status === 409 && body?.code === "ALREADY_REGISTERED";
      logStep(
        "Repeated roll number returns 409",
        ok,
        ok
          ? `Status 409 (${body.code}): "${body.message}"`
          : `Expected 409 ALREADY_REGISTERED, got ${res.status} (${body?.code || body?.message || "no body"})`
      );
    }

    // 8. Confirm a taken topic returns 409
    {
      const res = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: [spareStudents[0].roll_no, spareStudents[1].roll_no],
          topic: "Alpha Distributed Systems",
        }),
      });
      const body: any = await res.json().catch(() => null);
      const ok = res.status === 409 && body?.code === "TOPIC_TAKEN";
      logStep(
        "Taken topic returns 409",
        ok,
        ok
          ? `Status 409 (${body.code}): "${body.message}"`
          : `Expected 409 TOPIC_TAKEN, got ${res.status} (${body?.code || body?.message || "no body"})`
      );
    }

    // 9. Confirm a wrong team size returns 400
    {
      // Test with 1 member on Form 1 (where min_team_size = 2, max_team_size = 3)
      const resTooSmall = await fetch(`${api}/api/forms/${encodeURIComponent(form1Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: [spareStudents[0].roll_no],
        }),
      });
      const bodySmall: any = await resTooSmall.json().catch(() => null);

      // Test with 4 members on Form 1 (where max_team_size = 3)
      const resTooLarge = await fetch(`${api}/api/forms/${encodeURIComponent(form1Slug)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: [
            testStudents[0].roll_no,
            testStudents[1].roll_no,
            testStudents[2].roll_no,
            testStudents[3].roll_no,
          ],
        }),
      });
      const bodyLarge: any = await resTooLarge.json().catch(() => null);

      const ok =
        resTooSmall.status === 400 &&
        bodySmall?.code === "WRONG_TEAM_SIZE" &&
        resTooLarge.status === 400 &&
        bodyLarge?.code === "WRONG_TEAM_SIZE";

      logStep(
        "Wrong team size returns 400",
        ok,
        ok
          ? `1 member -> 400 (${bodySmall.code}), 4 members -> 400 (${bodyLarge.code})`
          : `Expected 400 WRONG_TEAM_SIZE, got ${resTooSmall.status}/${resTooLarge.status}`
      );
    }

    // 10. Check stats counts
    {
      const registeredOnForm2 = [...team1Students, ...team2Students];
      const expectedBoys = registeredOnForm2.filter((s) => s.gender === "M").length;
      const expectedGirls = registeredOnForm2.filter((s) => s.gender === "F").length;
      const expectedTotal = registeredOnForm2.length;

      const res = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}/stats`);
      const stats: any = await res.json().catch(() => null);
      const ok =
        res.status === 200 &&
        stats?.teams === 2 &&
        stats?.total === expectedTotal &&
        stats?.boys === expectedBoys &&
        stats?.girls === expectedGirls &&
        stats?.boys + stats?.girls === stats?.total;

      logStep(
        "Check stats counts",
        ok,
        ok
          ? `teams=${stats.teams}, total=${stats.total}, boys=${stats.boys}, girls=${stats.girls}`
          : `Mismatch: got ${JSON.stringify(stats)}, expected teams=2, total=${expectedTotal}, boys=${expectedBoys}, girls=${expectedGirls}`
      );
    }

    // 11. Download XLSX and confirm non-empty with right Content-Type
    {
      const res = await fetch(
        `${api}/api/admin/forms/${encodeURIComponent(form2Id)}/export/xlsx`,
        { headers: authHeaders() }
      );
      const contentType = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      const hasZipHeader = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
      const ok =
        res.status === 200 &&
        contentType.includes(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ) &&
        buf.length > 0 &&
        hasZipHeader;

      logStep(
        "Download XLSX export",
        ok,
        ok
          ? `Status 200, Content-Type='${contentType}', size=${buf.length} bytes`
          : `Failed: status=${res.status}, content-type='${contentType}', size=${buf.length}`
      );
    }

    // 12. Download PDF and confirm non-empty with right Content-Type
    {
      const res = await fetch(
        `${api}/api/admin/forms/${encodeURIComponent(form2Id)}/export/pdf`,
        { headers: authHeaders() }
      );
      const contentType = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      const hasPdfHeader = buf.length > 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";
      const ok =
        res.status === 200 &&
        contentType.includes("application/pdf") &&
        buf.length > 0 &&
        hasPdfHeader;

      logStep(
        "Download PDF export",
        ok,
        ok
          ? `Status 200, Content-Type='${contentType}', size=${buf.length} bytes`
          : `Failed: status=${res.status}, content-type='${contentType}', size=${buf.length}`
      );
    }
  } finally {
    // 13. Delete everything created by the smoke test
    if (token && createdFormIds.length > 0) {
      let allDeleted = true;
      const deleteDetails: string[] = [];

      for (const id of createdFormIds) {
        try {
          const delRes = await fetch(`${api}/api/admin/forms/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: authHeaders(),
          });
          if (delRes.status === 200) {
            deleteDetails.push(id);
          } else {
            allDeleted = false;
          }
        } catch {
          allDeleted = false;
        }
      }

      logStep(
        "Cleanup created test forms, topics & teams",
        allDeleted,
        allDeleted
          ? `Deleted ${deleteDetails.length} test form(s) and cascaded teams/topics`
          : `Failed to delete one or more test forms (${deleteDetails.length}/${createdFormIds.length} deleted)`
      );
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\nSmoke Test Summary: ${results.length - failed.length}/${results.length} steps passed.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSmokeTest().catch((err) => {
    console.error("[FAIL] Smoke test aborted:", err?.message || err);
    process.exit(1);
  });
}

