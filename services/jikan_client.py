import requests


def fetch_mal_data(mal_id):
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json().get("data", {})
            image_url = data.get("images", {}).get("jpg", {}).get("large_image_url")
            score = data.get("score")
            rank = data.get("rank")
            rank_str = str(rank) if rank is not None else "N/A"

            return {
                "cover_image_url": image_url,
                "mal_rating": score,
                "mal_rank": rank_str,
            }
        elif response.status_code == 429:
            print(f"⚠️ Jikan Rate Limit hit while fetching ID {mal_id}.")
            return None
    except Exception as e:
        print(f"❌ Failed to fetch Jikan data for ID {mal_id}: {e}")
    return None
