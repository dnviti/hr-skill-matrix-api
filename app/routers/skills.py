from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import crud, models
from ..database import get_db

router = APIRouter(
    prefix="/api/skills",
    tags=["Skills"],
    responses={404: {"description": "Not found"}},
)

@router.post("", response_model=models.SkillSchema, status_code=201)
def create_new_skill(skill: models.SkillCreate, db: Session = Depends(get_db)):
    db_skill = crud.get_skill_by_name(db, name=skill.name)
    if db_skill:
        raise HTTPException(status_code=400, detail="Skill with this name already registered")
    created = crud.create_skill(db=db, skill=skill)
    return models.SkillSchema.from_orm(created)

@router.get("", response_model=List[models.SkillSchema])
def read_all_skills(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    skills = crud.get_skills(db, skip=skip, limit=limit)
    return [models.SkillSchema.from_orm(s) for s in skills]

@router.delete("/{skill_id}", status_code=204)
def delete_single_skill(skill_id: int, db: Session = Depends(get_db)):
    db_skill = crud.delete_skill(db, skill_id=skill_id)
    if db_skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return None

# --- Skill labels ---
@router.post("/{skill_id}/labels/add", response_model=models.SkillSchema)
def add_skill_label(
    skill_id: int,
    label_data: models.SkillLabelAdd,
    db: Session = Depends(get_db)
):
    """Aggiunge una label a una skill"""
    skill = crud.add_skill_label(db, skill_id, label_data.label)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return models.SkillSchema.from_orm(skill)

@router.delete("/{skill_id}/labels/remove", response_model=models.SkillSchema)
def remove_skill_label(
    skill_id: int,
    label_data: models.SkillLabelRemove,
    db: Session = Depends(get_db)
):
    """Rimuove una label da una skill"""
    skill = crud.remove_skill_label(db, skill_id, label_data.label)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return models.SkillSchema.from_orm(skill)

@router.get("/by-label/{label}", response_model=List[models.SkillSchema])
def get_skills_by_label(
    label: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Trova tutte le skill che hanno una specifica label"""
    return crud.get_skills_by_label(db, label, skip, limit)

@router.get("/labels/all", response_model=List[str])
def get_all_labels(db: Session = Depends(get_db)):
    """Ottiene tutte le label uniche esistenti nel sistema"""
    return crud.get_all_labels(db)