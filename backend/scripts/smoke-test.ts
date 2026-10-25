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
          show_chosen_topics: true, // should be forced to false when collect_topic is false
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
        f.collect_topic === false &&
        f.show_chosen_topics === false;

      if (f?.id) {
        form1Id = f.id;
        form1Slug = f.slug;
        createdFormIds.push(f.id);
      }

      logStep(
        "Create Form 1 (min 2, max 3, topic off)",
        ok,
        ok
          ? `Created slug='${form1Slug}' (min=${f.min_team_size}, max=${f.max_team_size}, collect_topic=${f.collect_topic}, show_chosen_topics=${f.show_chosen_topics})`
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
        f.allow_topic_repeat === false &&
        f.show_chosen_topics === false;

      if (f?.id) {
        form2Id = f.id;
        form2Slug = f.slug;
        createdFormIds.push(f.id);
      }

      logStep(
        "Create Form 2 (topics on, repeat off, show_chosen_topics default off)",
        ok,
        ok
          ? `Created slug='${form2Slug}' (collect_topic=${f.collect_topic}, allow_topic_repeat=${f.allow_topic_repeat}, show_chosen_topics=${f.show_chosen_topics})`
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

    // 10b. Check GET /api/admin/forms/:id/pending (auth 401, 404 unknown id, counts, per-form isolation, natural sorting)
    {
      const compareRolls = (a: string, b: string): number => {
        const ra = a.trim().toUpperCase();
        const rb = b.trim().toUpperCase();
        if (ra.length !== rb.length) return ra.length - rb.length;
        return ra < rb ? -1 : ra > rb ? 1 : 0;
      };

      // 1) Without token -> 401
      const unauthRes = await fetch(
        `${api}/api/admin/forms/${encodeURIComponent(form2Id)}/pending`
      );
      const unauthBody: any = await unauthRes.json().catch(() => null);
      const okUnauth = unauthRes.status === 401 && Boolean(unauthBody?.error || unauthBody?.code);

      // 2) Unknown form id -> 404 JSON
      const notFoundRes = await fetch(
        `${api}/api/admin/forms/00000000-0000-0000-0000-000000000000/pending`,
        { headers: authHeaders() }
      );
      const notFoundBody: any = await notFoundRes.json().catch(() => null);
      const okNotFound =
        notFoundRes.status === 404 && Boolean(notFoundBody?.error || notFoundBody?.code);

      // 3) Form 1 (0 teams registered) -> all class students pending
      const f1Res = await fetch(
        `${api}/api/admin/forms/${encodeURIComponent(form1Id)}/pending`,
        { headers: authHeaders() }
      );
      const f1Body: any = await f1Res.json().catch(() => null);

      // 4) Form 2 (2 teams = 5 students registered) -> total - 5 pending
      const f2Res = await fetch(
        `${api}/api/admin/forms/${encodeURIComponent(form2Id)}/pending`,
        { headers: authHeaders() }
      );
      const f2Body: any = await f2Res.json().catch(() => null);

      const registeredOnForm2 = [...team1Students, ...team2Students];
      const registeredRollSet = new Set(registeredOnForm2.map((s) => s.roll_no.toUpperCase()));
      const classBoys = students.filter((s) => s.gender === "M").length;
      const classGirls = students.filter((s) => s.gender === "F").length;
      const regBoys = registeredOnForm2.filter((s) => s.gender === "M").length;
      const regGirls = registeredOnForm2.filter((s) => s.gender === "F").length;

      const f2Students: { roll_no: string; name: string; gender: "M" | "F" }[] = Array.isArray(
        f2Body?.students
      )
        ? f2Body.students
        : [];

      const isNaturallySorted = f2Students.every(
        (s, idx) => idx === 0 || compareRolls(f2Students[idx - 1].roll_no, s.roll_no) <= 0
      );
      const excludesRegistered = f2Students.every(
        (s) => !registeredRollSet.has(s.roll_no.toUpperCase())
      );

      const okCounts =
        f1Res.status === 200 &&
        f1Body?.total === students.length &&
        f1Body?.boys === classBoys &&
        f1Body?.girls === classGirls &&
        f2Res.status === 200 &&
        f2Body?.total === students.length - registeredOnForm2.length &&
        f2Body?.boys === classBoys - regBoys &&
        f2Body?.girls === classGirls - regGirls &&
        f2Body?.boys + f2Body?.girls === f2Body?.total &&
        f2Students.length === f2Body?.total;

      const ok =
        okUnauth && okNotFound && okCounts && isNaturallySorted && excludesRegistered;

      logStep(
        "GET /api/admin/forms/:id/pending (counts, sorting, 401/404, per-form isolation)",
        ok,
        ok
          ? `Form1 pending=${f1Body.total}/${students.length}, Form2 pending=${f2Body.total} (boys=${f2Body.boys}, girls=${f2Body.girls}), natural sort verified, 401/404 verified`
          : `Failed: unauth=${unauthRes.status}, notFound=${notFoundRes.status}, f1=${f1Body?.total}, f2=${JSON.stringify({
              total: f2Body?.total,
              boys: f2Body?.boys,
              girls: f2Body?.girls,
              len: f2Students.length,
              sorted: isNaturallySorted,
              excludesReg: excludesRegistered,
            })}`
      );
    }

    // 11. Check GET /api/forms/:slug/chosen-topics with show_chosen_topics OFF vs ON (no PII)
    {
      const resTopicOff = await fetch(
        `${api}/api/forms/${encodeURIComponent(form1Slug)}/chosen-topics`
      );
      const bodyTopicOff: any = await resTopicOff.json().catch(() => null);

      const resShowOff = await fetch(
        `${api}/api/forms/${encodeURIComponent(form2Slug)}/chosen-topics`
      );
      const bodyShowOff: any = await resShowOff.json().catch(() => null);

      const pubBeforeRes = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}`);
      const pubBeforeBody: any = await pubBeforeRes.json().catch(() => null);

      // Enable show_chosen_topics on Form 2
      const patchOnRes = await fetch(`${api}/api/admin/forms/${encodeURIComponent(form2Id)}`, {
        method: "PATCH",
        headers: jsonHeaders(true),
        body: JSON.stringify({ show_chosen_topics: true }),
      });
      const patchOnBody: any = await patchOnRes.json().catch(() => null);

      const pubAfterRes = await fetch(`${api}/api/forms/${encodeURIComponent(form2Slug)}`);
      const pubAfterBody: any = await pubAfterRes.json().catch(() => null);

      const resShowOn = await fetch(
        `${api}/api/forms/${encodeURIComponent(form2Slug)}/chosen-topics`
      );
      const bodyShowOn: any = await resShowOn.json().catch(() => null);
      const rawJsonOn = JSON.stringify(bodyShowOn || []);

      const registeredOnForm2 = [...team1Students, ...team2Students];
      const leaksPii = registeredOnForm2.some(
        (s) =>
          rawJsonOn.includes(s.roll_no) ||
          rawJsonOn.includes(s.name) ||
          rawJsonOn.includes("roll_no") ||
          rawJsonOn.includes("name") ||
          rawJsonOn.includes("members")
      );

      // Turn show_chosen_topics back OFF and verify empty list
      await fetch(`${api}/api/admin/forms/${encodeURIComponent(form2Id)}`, {
        method: "PATCH",
        headers: jsonHeaders(true),
        body: JSON.stringify({ show_chosen_topics: false }),
      });
      const resShowOffAgain = await fetch(
        `${api}/api/forms/${encodeURIComponent(form2Slug)}/chosen-topics`
      );
      const bodyShowOffAgain: any = await resShowOffAgain.json().catch(() => null);

      const okOff =
        resTopicOff.status === 200 &&
        Array.isArray(bodyTopicOff) &&
        bodyTopicOff.length === 0 &&
        resShowOff.status === 200 &&
        Array.isArray(bodyShowOff) &&
        bodyShowOff.length === 0 &&
        pubBeforeBody?.show_chosen_topics === false &&
        resShowOffAgain.status === 200 &&
        Array.isArray(bodyShowOffAgain) &&
        bodyShowOffAgain.length === 0;

      const okOn =
        patchOnRes.status === 200 &&
        patchOnBody?.form?.show_chosen_topics === true &&
        pubAfterBody?.show_chosen_topics === true &&
        resShowOn.status === 200 &&
        Array.isArray(bodyShowOn) &&
        bodyShowOn.length === 2 &&
        bodyShowOn[0]?.topic === "Alpha Distributed Systems" &&
        JSON.stringify(bodyShowOn[0]?.teamNos) === JSON.stringify([1]) &&
        bodyShowOn[0]?.count === 1 &&
        bodyShowOn[1]?.topic === "Beta Compiler Design" &&
        JSON.stringify(bodyShowOn[1]?.teamNos) === JSON.stringify([2]) &&
        bodyShowOn[1]?.count === 1 &&
        !leaksPii;

      const ok = okOff && okOn;
      logStep(
        "GET /api/forms/:slug/chosen-topics (show_chosen_topics OFF vs ON, CSV topics)",
        ok,
        ok
          ? `show_chosen_topics OFF -> [], ON -> ${bodyShowOn.length} items, no roll numbers/names leaked`
          : `Failed: topicOff=${JSON.stringify(bodyTopicOff)}, showOff=${JSON.stringify(bodyShowOff)}, on=${rawJsonOn}, leaksPii=${leaksPii}`
      );
    }

    // 12. Free-text topic mode (no CSV): repeat OFF -> 409 on "smart  parking", repeat ON -> Teams 1, 2 · count 2, collect_topic OFF -> resets show_chosen_topics
    {
      const slug3 = `smoke-freetext-${runSuffix}`;
      const createRes = await fetch(`${api}/api/admin/forms`, {
        method: "POST",
        headers: jsonHeaders(true),
        body: JSON.stringify({
          title: `Smoke Free Text Form (${runSuffix})`,
          description: "Automated smoke test form (free-text topics)",
          slug: slug3,
          min_team_size: 2,
          max_team_size: 3,
          collect_topic: true,
          allow_topic_repeat: false,
          show_chosen_topics: true,
          is_open: true,
        }),
      });
      const createBody: any = await createRes.json().catch(() => null);
      const form3Id = createBody?.form?.id;
      if (form3Id) {
        createdFormIds.push(form3Id);
      }

      // Submit Team 1 with "Smart Parking"
      const sub1Res = await fetch(`${api}/api/forms/${encodeURIComponent(slug3)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: team1Students.map((s) => s.roll_no),
          topic: "Smart Parking",
        }),
      });
      const sub1Body: any = await sub1Res.json().catch(() => null);

      // Check chosen-topics after Team 1
      const chosen1Res = await fetch(
        `${api}/api/forms/${encodeURIComponent(slug3)}/chosen-topics`
      );
      const chosen1Body: any = await chosen1Res.json().catch(() => null);

      // Server rejection with 409 for "smart  parking" while repeat is OFF
      const dupSubRes = await fetch(`${api}/api/forms/${encodeURIComponent(slug3)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: team2Students.map((s) => s.roll_no),
          topic: "smart  parking",
        }),
      });
      const dupSubBody: any = await dupSubRes.json().catch(() => null);

      // Enable allow_topic_repeat and submit Team 2 with "smart  parking"
      await fetch(`${api}/api/admin/forms/${encodeURIComponent(form3Id)}`, {
        method: "PATCH",
        headers: jsonHeaders(true),
        body: JSON.stringify({ allow_topic_repeat: true }),
      });

      const sub2Res = await fetch(`${api}/api/forms/${encodeURIComponent(slug3)}/submit`, {
        method: "POST",
        headers: jsonHeaders(false),
        body: JSON.stringify({
          rolls: team2Students.map((s) => s.roll_no),
          topic: "smart  parking",
        }),
      });
      const sub2Body: any = await sub2Res.json().catch(() => null);

      // Check chosen-topics groups case-insensitively with first-seen spelling and teamNos [1, 2]
      const chosen2Res = await fetch(
        `${api}/api/forms/${encodeURIComponent(slug3)}/chosen-topics`
      );
      const chosen2Body: any = await chosen2Res.json().catch(() => null);
      const chosen2Raw = JSON.stringify(chosen2Body || []);
      const leaksPii = [...team1Students, ...team2Students].some(
        (s) => chosen2Raw.includes(s.roll_no) || chosen2Raw.includes(s.name)
      );

      // Turn collect_topic OFF and confirm show_chosen_topics resets to false and chosen-topics returns []
      const turnOffCollectRes = await fetch(`${api}/api/admin/forms/${encodeURIComponent(form3Id)}`, {
        method: "PATCH",
        headers: jsonHeaders(true),
        body: JSON.stringify({ collect_topic: false }),
      });
      const turnOffCollectBody: any = await turnOffCollectRes.json().catch(() => null);
      const chosenAfterCollectOffRes = await fetch(
        `${api}/api/forms/${encodeURIComponent(slug3)}/chosen-topics`
      );
      const chosenAfterCollectOffBody: any = await chosenAfterCollectOffRes.json().catch(() => null);

      const ok =
        createBody?.form?.show_chosen_topics === true &&
        sub1Res.status === 201 &&
        sub1Body?.teamNo === 1 &&
        Array.isArray(chosen1Body) &&
        chosen1Body.length === 1 &&
        chosen1Body[0]?.topic === "Smart Parking" &&
        dupSubRes.status === 409 &&
        dupSubBody?.code === "TOPIC_TAKEN" &&
        sub2Res.status === 201 &&
        sub2Body?.teamNo === 2 &&
        Array.isArray(chosen2Body) &&
        chosen2Body.length === 1 &&
        chosen2Body[0]?.topic === "Smart Parking" &&
        JSON.stringify(chosen2Body[0]?.teamNos) === JSON.stringify([1, 2]) &&
        chosen2Body[0]?.count === 2 &&
        !leaksPii &&
        turnOffCollectBody?.form?.collect_topic === false &&
        turnOffCollectBody?.form?.show_chosen_topics === false &&
        Array.isArray(chosenAfterCollectOffBody) &&
        chosenAfterCollectOffBody.length === 0;

      logStep(
        "Free-text chosen-topics, repeat OFF/ON & collect_topic OFF reset",
        ok,
        ok
          ? `Team 1 "Smart Parking" -> "smart  parking" 409 when repeat OFF -> accepted when repeat ON -> grouped as { topic: "Smart Parking", teamNos: [1, 2], count: 2 } -> collect_topic OFF resets show_chosen_topics=false & returns []`
          : `Failed: sub1=${sub1Res.status}, dup=${dupSubRes.status}, sub2=${sub2Res.status}, chosen2=${chosen2Raw}, afterCollectOff=${JSON.stringify(turnOffCollectBody?.form)}`
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

