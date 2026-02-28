import gspread


def test_sheets_connection():
    print("Connecting to Google Sheets...")

    # Authenticate using the credentials file you just downloaded
    gc = gspread.service_account(filename="credentials.json")

    try:
        # Open the specific Google Sheet document
        # IMPORTANT: Change "Anime Database" if your document title is different!
        sh = gc.open("Anime Database")

        # Select the specific worksheet (tab) inside the document
        # Change "Anime" if your tab at the bottom of the screen has a different name!
        worksheet = sh.worksheet("Anime")

        # Fetch the first row (the headers) to prove it works
        headers = worksheet.row_values(1)

        print("\n✅ Successfully connected! Here are your headers:")
        print(headers)

    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    test_sheets_connection()
