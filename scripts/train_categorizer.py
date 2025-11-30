from app import models
from app.categorization import train_from_transactions, get_categorizer_status
from app.database import SessionLocal


def main():
    db = SessionLocal()
    try:
        transactions = (
            db.query(models.Transaction)
            .join(models.Account)
            .filter(models.Transaction.category.isnot(None))
            .all()
        )
        report = train_from_transactions(transactions)
    finally:
        db.close()

    if not report.trained:
        print("Training did not run. Make sure transactions have categories.")
        return

    print(f"Trained on {report.samples} samples.")
    if report.heldout_samples:
        print(f"Held-out accuracy: {report.accuracy:.3f}, macro F1: {report.macro_f1:.3f}")
    print(f"Labels: {report.labels}")
    if report.saved_to:
        print(f"Saved model to: {report.saved_to}")
    print(f"Current status: {get_categorizer_status()}")


if __name__ == "__main__":
    main()
