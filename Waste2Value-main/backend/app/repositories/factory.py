import os
from app.repositories.base import BaseRepository


def get_repository() -> BaseRepository:
    """
    REPOSITORY=dynamodb -> AWS DynamoDB (strict: fails fast if unreachable).
    anything else       -> local SQLite (development / tests).
    """
    if os.getenv("REPOSITORY", "sqlite").lower() == "dynamodb":
        from app.repositories.dynamodb_repo import DynamoDBRepository

        repo = DynamoDBRepository(strict=True)
        repo.seed_if_empty()
        return repo
    from app.repositories.sqlite_repo import SQLiteRepository

    return SQLiteRepository()
