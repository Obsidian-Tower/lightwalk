import requests
import pandas as pd

URL = "https://lightwalk.coryzuber.workers.dev/get-polygons"

def fetch_polygons():
    response = requests.get(URL)
    response.raise_for_status()
    return response.json()

def build_dataframe():
    data = fetch_polygons()
    df = pd.DataFrame(data)
    return df

if __name__ == "__main__":
    df = build_dataframe()

    print("\n--- DATAFRAME ---\n")
    print(df.head())

    print("\n--- INFO ---\n")
    print(df.info())