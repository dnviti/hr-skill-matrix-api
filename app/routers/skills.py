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
    return crud.create_skill(db=db, skill=skill)

@router.get("", response_model=List[models.SkillSchema])
def read_all_skills(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    skills = crud.get_skills(db, skip=skip, limit=limit)
    return skills

@router.delete("/{skill_id}", status_code=204)
def delete_single_skill(skill_id: int, db: Session = Depends(get_db)):
    db_skill = crud.delete_skill(db, skill_id=skill_id)
    if db_skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return None