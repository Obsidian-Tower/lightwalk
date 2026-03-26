
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }
    
    if (url.pathname === "/") {
      return serveStatic("index.html", env);
    }

    try {
      // 🔹 Batch insert (PRIMARY)
      if (request.method === "POST" && url.pathname === "/init-parcels") {
        return handleInitParcels(request, env);
      }

      // 🔹 Single insert (fallback)
      if (request.method === "POST" && url.pathname === "/init-parcel") {
        return handleInitParcel(request, env);
      }

      return json({ error: "Not found" }, 404);

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};


// ================================
// 🔥 HANDLERS
// ================================

// ✅ Batch insert (BEST)
async function handleInitParcels(request, env) {
  try {
    const raw = await request.text();
    console.log("RAW BODY:", raw);

    const body = JSON.parse(raw);
    console.log("PARSED BODY:", body);

    const parcel_ids = body.parcel_ids;
    console.log("COUNT:", parcel_ids?.length);

    // 🔥 HARD TEST DB
    const test = await env.DB.prepare("SELECT 1 as test").first();
    console.log("DB OK:", test);

    // 🔥 INSERT ONE ROW ONLY (critical test)
    const pid = parcel_ids[0];

    const result = await env.DB.prepare(`
      INSERT INTO parcel_status (id, parcel_id, status, updated_by)
      VALUES (?, ?, 'prospect', 'system')
      ON CONFLICT(parcel_id) DO NOTHING
    `)
    .bind(crypto.randomUUID(), pid.toString())
    .run();

    console.log("INSERT RESULT:", result);

    return new Response("SUCCESS");

  } catch (err) {
    console.error("FULL ERROR:", err);
    return new Response(err.stack || err.message, { status: 500 });
  }
}


// ✅ Single insert (fallback)
async function handleInitParcel(request, env) {
  const { parcel_id } = await request.json();

  if (!parcel_id) {
    return json({ error: "Missing parcel_id" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM parcel_status WHERE parcel_id = ? LIMIT 1"
  )
    .bind(parcel_id.toString())
    .first();

  if (existing) {
    return json({ success: true, message: "Already exists" });
  }

  await env.DB.prepare(`
    INSERT INTO parcel_status (id, parcel_id, status, updated_by)
    VALUES (?, ?, 'prospect', 'system')
  `)
    .bind(crypto.randomUUID(), parcel_id.toString())
    .run();

  return json({ success: true, created: true });
}


// ================================
// 🧰 HELPERS
// ================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}