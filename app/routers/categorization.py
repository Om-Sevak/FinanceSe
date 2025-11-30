from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..categorization import (
    categorize_with_details,
    get_categorizer_status,
    train_from_transactions,
)
from ..database import get_db

router = APIRouter(prefix="/categorization", tags=["categorization"])


@router.get("/status", response_model=schemas.CategorizationStatus)
def status():
    return get_categorizer_status()


@router.post("/predict", response_model=schemas.CategorizationPrediction)
def predict(request: schemas.CategorizationPredictRequest):
    prediction = categorize_with_details(
        request.description,
        amount=request.amount,
        date_value=request.date,
        account_type=request.account_type,
    )
    top = [schemas.CategoryScore(category=cat, confidence=conf) for cat, conf in prediction.top_categories]
    return schemas.CategorizationPrediction(
        category=prediction.category,
        confidence=prediction.confidence,
        source=prediction.source,
        top_categories=top,
        normalized_description=prediction.normalized_description,
    )


@router.post("/train", response_model=schemas.CategorizationTrainResponse)
def train(db: Session = Depends(get_db)):
    transactions = (
        db.query(models.Transaction)
        .join(models.Account)
        .filter(models.Transaction.category.isnot(None))
        .all()
    )
    if not transactions:
        raise HTTPException(status_code=400, detail="No categorized transactions available to train on.")

    report = train_from_transactions(transactions)
    if not report.trained:
        raise HTTPException(status_code=400, detail="Training did not run. Provide categorized data.")

    return schemas.CategorizationTrainResponse(
        trained=report.trained,
        samples=report.samples,
        labels=report.labels,
        accuracy=report.accuracy,
        macro_f1=report.macro_f1,
        heldout_samples=report.heldout_samples,
        saved_to=report.saved_to,
    )
