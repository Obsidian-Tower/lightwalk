
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }
    if (request.method === "POST" && url.pathname === "/update-parcel-status") {
      return handleUpdateParcelStatus(request, env);
    }
    if (url.pathname === "/get-current-parcels") {
      return handleGetCurrentParcels(request, env);
    }
    
    if (url.pathname === "/") {
      return serveStatic("index.html", env);
    }

    if (url.pathname === "/get-parcels") {
      return handleGetParcels(request, env);
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

async function handleUpdateParcelStatus(request, env) {
  try {
    const body = await request.json();

    const { parcel_id, status, user } = body;

    if (!parcel_id || !status || !user) {
      return json({ error: "Missing parcel_id, status, or user" }, 400);
    }

    // 🔥 Insert new row (append-only history)
    await env.DB.prepare(`
      INSERT INTO parcel_status (id, parcel_id, status, updated_by)
      VALUES (?, ?, ?, ?)
    `)
      .bind(
        crypto.randomUUID(),
        parcel_id.toString(),
        status,
        user
      )
      .run();

    return json({
      success: true,
      parcel_id,
      status,
      user
    });

  } catch (err) {
    console.error("update-parcel-status error:", err);
    return json({ error: err.message }, 500);
  }
}

// add to your Worker
async function handleGetParcels(request, env) {
  
  const rows = await env.DB.prepare(`
    SELECT * FROM parcel_status
    ORDER BY created_at DESC
  `).all();

  return new Response(JSON.stringify(rows.results), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleInitParcels(request, env) {
  try {
    const body = await request.json();
    const parcel_ids = body.parcel_ids;

    if (!parcel_ids || !parcel_ids.length) {
      return new Response(JSON.stringify({ error: "No parcel_ids provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const inserts = [];

    for (const pid of parcel_ids) {
      if (!pid) continue;

      inserts.push(
        env.DB.prepare(`
          INSERT INTO parcel_status (id, parcel_id, status, updated_by)
          VALUES (?, ?, 'prospect', 'system')
        `).bind(
          crypto.randomUUID(),
          String(pid)
        )
      );
    }

    await env.DB.batch(inserts);

    return new Response(JSON.stringify({
      success: true,
      inserted_attempted: parcel_ids.length
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("ERROR:", err);
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

async function handleGetCurrentParcels(request, env) {
  try {
    const body = await request.json();
    const parcel_ids = body.parcel_ids;

    if (!parcel_ids || !parcel_ids.length) {
      return json({ error: "No parcel_ids provided" }, 400);
    }

    // 🔥 Build dynamic placeholders (?, ?, ?, ...)
    const placeholders = parcel_ids.map(() => "?").join(",");

    const query = `
      SELECT ps.*
      FROM parcel_status ps
      INNER JOIN (
        SELECT parcel_id, MAX(created_at) AS max_created
        FROM parcel_status
        WHERE parcel_id IN (${placeholders})
        GROUP BY parcel_id
      ) latest
      ON ps.parcel_id = latest.parcel_id
      AND ps.created_at = latest.max_created
    `;

    const stmt = env.DB.prepare(query).bind(...parcel_ids);
    const rows = await stmt.all();

    return json(rows.results);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
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