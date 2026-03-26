import requests
import pandas as pd

# 🔗 your worker endpoint
URL = "https://lightwalk.coryzuber.workers.dev/get-parcels"

def fetch_parcels():
    response = requests.get(URL)
    response.raise_for_status()
    data = response.json()
    return data

def build_dataframe():
    data = fetch_parcels()
    df = pd.DataFrame(data)
    return df

if __name__ == "__main__":
    df = build_dataframe()

    print("\n--- DATAFRAME ---\n")
    print(df.head())

    print("\n--- INFO ---\n")
    print(df.info())
    df = df[df['parcel_id'] == "3578244"]