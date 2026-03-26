export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
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
  const { parcel_ids } = await request.json();

  if (!parcel_ids || !parcel_ids.length) {
    return json({ error: "No parcel_ids provided" }, 400);
  }

  const inserts = [];

  for (const pid of parcel_ids) {
    if (!pid) continue;

    inserts.push(
      env.DB.prepare(`
        INSERT INTO parcel_status (id, parcel_id, status, updated_by)
        VALUES (?, ?, 'prospect', 'system')
        ON CONFLICT(parcel_id) DO NOTHING;
      `).bind(crypto.randomUUID(), pid.toString(), pid.toString())
    );
  }

  await env.DB.batch(inserts);

  return json({
    success: true,
    inserted_attempted: parcel_ids.length
  });
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