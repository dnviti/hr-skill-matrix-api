from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import crud, models
from ..database import get_db

router = APIRouter(
    prefix="/api/business_units",
    tags=["Business Units"],
    responses={404: {"description": "Not found"}},
)

@router.post("", response_model=models.BusinessUnitSchema, status_code=201)
def create_bu(bu: models.BusinessUnitCreate, db: Session = Depends(get_db)):
    db_bu = crud.get_business_unit_by_name(db, name=bu.name)
    if db_bu:
        raise HTTPException(status_code=400, detail="Business Unit già esistente")
    return crud.create_business_unit(db=db, bu=bu)

@router.get("", response_model=List[models.BusinessUnitSchema])
def read_bus(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_business_units(db, skip=skip, limit=limit)

@router.get("/{bu_id}", response_model=models.BusinessUnitSchema)
def read_bu(bu_id: int, db: Session = Depends(get_db)):
    db_bu = crud.get_business_unit(db, bu_id=bu_id)
    if db_bu is None:
        raise HTTPException(status_code=404, detail="Business Unit non trovata")
    return db_bu

@router.delete("/{bu_id}", response_model=models.BusinessUnitSchema)
def delete_bu(bu_id: int, options: models.BuDeleteOptions, db: Session = Depends(get_db)):
    try:
        deleted_bu = crud.delete_business_unit(db, bu_id=bu_id, options=options)
        if deleted_bu is None:
            raise HTTPException(status_code=404, detail="Business Unit non trovata")
        return deleted_bu
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
