import requests
import pandas as pd

# 🔧 CONFIG
API_URL = "https://lightwalk.coryzuber.workers.dev/get-polygons"  # <-- change this

def fetch_polygons():
    res = requests.get(API_URL)
    res.raise_for_status()
    data = res.json()

    # 🔥 Normalize into DataFrame
    df = pd.DataFrame(data)

    # 🔥 Parse coords JSON into usable Python objects
    if "coords" in df.columns:
        df["coords"] = df["coords"].apply(lambda x: x if isinstance(x, list) else [])

    return df


df = fetch_polygons()

print("\n=== POLYGONS TABLE ===\n")
print(df)

print("\n=== INFO ===\n")
print(df.info())

print("\n=== HEAD ===\n")
print(df.head())

# Optional: explode coords into rows (useful for analysis)
if "coords" in df.columns:
    exploded = df.explode("coords")
    exploded[["lat", "lng"]] = pd.DataFrame(
        exploded["coords"].tolist(),
        index=exploded.index
    )
    print("\n=== EXPLODED COORDS ===\n")
    print(exploded.head())
