from fastapi import FastAPI
from database import engine, Base

# This line is the magic: It tells SQLAlchemy to look at the AnimeEntry model
# we just made, go to PostgreSQL, and CREATE the table if it doesn't exist yet!
Base.metadata.create_all(bind=engine)

# Initialize the FastAPI application
app = FastAPI(title="Anime Site API")


# A simple root endpoint to test if the server is running
@app.get("/")
def read_root():
    return {"message": "⛩️ Welcome to the Anime Site API! Your database is connected."}
