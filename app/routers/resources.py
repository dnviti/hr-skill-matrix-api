from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import crud, models
from ..database import get_db

router = APIRouter(
    prefix="/api/resources",
    tags=["Resources"],
    responses={404: {"description": "Not found"}},
)

# Funzione helper per convertire i dati per la risposta
def format_resource_response(db_resource: models.Resource) -> dict:
    return {
        "id": db_resource.id,
        "nome": db_resource.nome,
        "cognome": db_resource.cognome,
        "email": db_resource.email,
        "numero": db_resource.numero,
        "business_unit": db_resource.business_unit,
        "skills": [
            {"skill_id": link.skill_id, "level": link.level, "name": link.skill.name}
            for link in db_resource.skill_links
        ]
    }

@router.post("", response_model=models.ResourceSchema, status_code=201)
def create_new_resource(resource: models.ResourceCreate, db: Session = Depends(get_db)):
    db_resource = crud.create_resource(db=db, resource=resource)
    return format_resource_response(db_resource)

@router.get("", response_model=List[models.ResourceSchema])
def read_all_resources(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    resources = crud.get_resources(db, skip=skip, limit=limit)
    return [format_resource_response(res) for res in resources]

@router.get("/{resource_id}", response_model=models.ResourceSchema)
def read_single_resource(resource_id: int, db: Session = Depends(get_db)):
    db_resource = crud.get_resource(db, resource_id=resource_id)
    if db_resource is None:
        raise HTTPException(status_code=404, detail="Risorsa non trovata")
    return format_resource_response(db_resource)

@router.delete("/{resource_id}", response_model=models.ResourceSchema)
def delete_single_resource(resource_id: int, db: Session = Depends(get_db)):
    db_resource = crud.delete_resource(db, resource_id=resource_id)
    if db_resource is None:
        raise HTTPException(status_code=404, detail="Risorsa non trovata")
    return format_resource_response(db_resource)

@router.put("/{resource_id}/skills", response_model=models.ResourceSchema)
def update_skills_for_resource(resource_id: int, skills: List[models.ResourceSkillUpdate], db: Session = Depends(get_db)):
    db_resource = crud.update_resource_skills(db, resource_id=resource_id, skills=skills)
    if db_resource is None:
        raise HTTPException(status_code=404, detail="Risorsa non trovata")
    return format_resource_response(db_resource)
