
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

    // 🔥 USER LOCATION UPDATE
    if (request.method === "POST" && url.pathname === "/update-location") {
      return handleUpdateLocation(request, env);
    }

    // 🔥 GET ALL ACTIVE USERS
    if (request.method === "GET" && url.pathname === "/get-locations") {
      return handleGetLocations(env);
    }

    if (url.pathname === "/get-polygons") {
      return handleGetPolygons(request, env);
    }

    if (url.pathname === "/get-active-polygons") {
      return handleGetActivePolygons(request, env);
    }

    if (request.method === "POST" && url.pathname === "/update-active-polygons") {
      return handleUpdateActivePolygons(request, env);
    }

    if (request.method === "POST" && url.pathname === "/save-polygon") {
      return handleSavePolygon(request, env);
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

async function handleUpdateLocation(request, env) {
  try {
    const body = await request.json();

    const {
      user,
      lat,
      lng,
      accuracy = null,
      heading = null,
      speed = null
    } = body;

    if (!user || lat == null || lng == null) {
      return json({ error: "Missing required fields" }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(`
      INSERT INTO user_locations (user, lat, lng, accuracy, heading, speed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user) DO UPDATE SET
        lat = excluded.lat,
        lng = excluded.lng,
        accuracy = excluded.accuracy,
        heading = excluded.heading,
        speed = excluded.speed,
        updated_at = excluded.updated_at
    `)
      .bind(user, lat, lng, accuracy, heading, speed, now)
      .run();

    return json({ success: true });

  } catch (err) {
    console.error("update-location error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleGetLocations(env) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // 🔥 only return users active in last 10 seconds
    const result = await env.DB.prepare(`
      SELECT user, lat, lng, accuracy, heading, speed, updated_at
      FROM user_locations
      WHERE updated_at > ?
    `)
      .bind(now - 10)
      .all();

    return json(result.results || []);

  } catch (err) {
    console.error("get-locations error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleGetPolygons(request, env) {
  try {
    const rows = await env.DB.prepare(`
      SELECT id, user, coords, created_at
      FROM polygons
      ORDER BY id ASC
    `).all();

    const results = rows.results.map(row => ({
      ...row,
      coords: JSON.parse(row.coords)
    }));

    return json(results);

  } catch (err) {
    console.error("get-polygons error:", err);
    return json({ error: err.message }, 500);
  }
}
async function handleSavePolygon(request, env) {
  try {
    const body = await request.json();
    const { user, coords } = body;

    if (!user || !coords) {
      return json({ error: "Missing user or coords" }, 400);
    }

    // 🔥 insert into DB
    const result = await env.DB.prepare(`
      INSERT INTO polygons (user, coords)
      VALUES (?, ?)
    `)
      .bind(user, JSON.stringify(coords))
      .run();

    // 🔥 get inserted row id
    const id = result.meta.last_row_id;

    return json({
      success: true,
      id
    });

  } catch (err) {
    console.error("save-polygon error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleGetActivePolygons(request, env) {
  try {
    const url = new URL(request.url);
    const user = url.searchParams.get("user");

    if (!user) {
      return json({ error: "Missing user" }, 400);
    }

    const row = await env.DB.prepare(`
      SELECT active_polygons
      FROM user_active_polygons
      WHERE user = ?
      LIMIT 1
    `)
      .bind(user)
      .first();

    if (!row) {
      // 🔥 no row yet → return empty list
      return json({ active_polygons: [] });
    }

    return json({
      active_polygons: JSON.parse(row.active_polygons || "[]")
    });

  } catch (err) {
    console.error("get-active-polygons error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleUpdateActivePolygons(request, env) {
  try {
    const body = await request.json();
    const { user, active_polygons } = body;

    if (!user || !Array.isArray(active_polygons)) {
      return json({ error: "Missing user or active_polygons" }, 400);
    }

    const jsonList = JSON.stringify(active_polygons);

    // 🔥 UPSERT (insert or update)
    await env.DB.prepare(`
      INSERT INTO user_active_polygons (user, active_polygons, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user) DO UPDATE SET
        active_polygons = excluded.active_polygons,
        updated_at = CURRENT_TIMESTAMP
    `)
      .bind(user, jsonList)
      .run();

    return json({
      success: true
    });

  } catch (err) {
    console.error("update-active-polygons error:", err);
    return json({ error: err.message }, 500);
  }
}

async function handleUpdateParcelStatus(request, env) {
  try {
    const body = await request.json();

    const { parcel_id, status, user } = body;

    if (!parcel_id || !status || !user) {
      return json({ error: "Missing parcel_id, status, or user" }, 400);
    }

    const normalizedId = parcel_id.toString();

    // 🔥 INSERT new row
    await env.DB.prepare(`
      INSERT INTO parcel_status (id, parcel_id, status, updated_by, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(
        crypto.randomUUID(),
        normalizedId,
        status,
        user
      )
      .run();

    // 🔥 IMMEDIATELY fetch the TRUE latest row (same logic as your read endpoint)
    const latest = await env.DB.prepare(`
      SELECT *
      FROM parcel_status
      WHERE parcel_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `)
      .bind(normalizedId)
      .first();

    // 🔥 return actual DB truth
    return json({
      success: true,
      parcel: latest
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
          SELECT ?, ?, 'prospect', 'system'
          WHERE NOT EXISTS (
            SELECT 1 FROM parcel_status WHERE parcel_id = ?
          )
        `).bind(
          crypto.randomUUID(),
          String(pid),
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
    console.log(placeholders)
    const query = `
      SELECT ps.*
      FROM parcel_status ps
      INNER JOIN (
        SELECT parcel_id, MAX(rowid) AS max_rowid
        FROM parcel_status
        WHERE parcel_id IN (${placeholders})
        GROUP BY parcel_id
      ) latest
      ON ps.rowid = latest.max_rowid
    `;

    const normalizedIds = parcel_ids.map(id => id.toString());

    const stmt = env.DB.prepare(query).bind(...normalizedIds);
    const rows = await stmt.all();
    console.log(rows)
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