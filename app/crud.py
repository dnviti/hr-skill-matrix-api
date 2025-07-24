from sqlalchemy.orm import Session, joinedload
from typing import List
from . import models

# --- Business Unit ---
def get_business_unit(db: Session, bu_id: int):
    return db.query(models.BusinessUnit).filter(models.BusinessUnit.id == bu_id).first()

def get_business_unit_by_name(db: Session, name: str):
    return db.query(models.BusinessUnit).filter(models.BusinessUnit.name == name).first()

def get_business_units(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.BusinessUnit).offset(skip).limit(limit).all()

def create_business_unit(db: Session, bu: models.BusinessUnitCreate):
    db_bu = models.BusinessUnit(name=bu.name)
    db.add(db_bu)
    db.commit()
    db.refresh(db_bu)
    return db_bu

def delete_business_unit(db: Session, bu_id: int, options: models.BuDeleteOptions):
    db_bu = get_business_unit(db, bu_id)
    if not db_bu:
        return None

    resources_in_bu = db.query(models.Resource).filter(models.Resource.business_unit_id == bu_id).all()

    if options.action == "migrate":
        if not options.target_bu_id:
            raise ValueError("Target Business Unit ID is required for migration.")
        target_bu = get_business_unit(db, options.target_bu_id)
        if not target_bu:
            raise ValueError("Target Business Unit not found.")
        for resource in resources_in_bu:
            resource.business_unit_id = options.target_bu_id
    elif options.action == "delete":
        for resource in resources_in_bu:
            db.delete(resource)

    db.delete(db_bu)
    db.commit()
    return db_bu

# --- Skill ---
def get_skill(db: Session, skill_id: int):
    return db.query(models.Skill).filter(models.Skill.id == skill_id).first()

def get_skill_by_name(db: Session, name: str):
    return db.query(models.Skill).filter(models.Skill.name == name).first()

def get_skills(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Skill).offset(skip).limit(limit).all()

def create_skill(db: Session, skill: models.SkillCreate):
    db_skill = models.Skill(name=skill.name)
    if skill.labels is not None:
        db_skill.set_labels_from_list(skill.labels)
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill

def delete_skill(db: Session, skill_id: int):
    db_skill = get_skill(db, skill_id)
    if db_skill:
        db.delete(db_skill)
        db.commit()
    return db_skill

def update_skill_labels(db: Session, skill_id: int, labels: List[str]):
    db_skill = get_skill(db, skill_id)
    if not db_skill:
        return None
    db_skill.set_labels_from_list(labels)
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill

def add_skill_label(db: Session, skill_id: int, label: str):
    db_skill = get_skill(db, skill_id)
    if not db_skill:
        return None
    db_skill.add_label(label)
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill

def remove_skill_label(db: Session, skill_id: int, label: str):
    db_skill = get_skill(db, skill_id)
    if not db_skill:
        return None
    db_skill.remove_label(label)
    db.add(db_skill)
    db.commit()
    db.refresh(db_skill)
    return db_skill

# --- Resource ---
def get_resource_by_email(db: Session, email: str):
    return db.query(models.Resource).filter(models.Resource.email == email).first()

def get_resource(db: Session, resource_id: int):
    # Eager load business_unit and skill_links to avoid N+1 queries
    return db.query(models.Resource).options(
        joinedload(models.Resource.business_unit),
        joinedload(models.Resource.skill_links).joinedload(models.ResourceSkillLink.skill)
    ).filter(models.Resource.id == resource_id).first()

def get_resources(db: Session, skip: int = 0, limit: int = 100):
    # Eager load business_unit and skill_links
    return db.query(models.Resource).options(
        joinedload(models.Resource.business_unit),
        joinedload(models.Resource.skill_links).joinedload(models.ResourceSkillLink.skill)
    ).offset(skip).limit(limit).all()

def create_resource(db: Session, resource: models.ResourceCreate):
    db_resource = models.Resource(
        nome=resource.nome,
        cognome=resource.cognome,
        email=resource.email,
        numero=resource.numero,
        business_unit_id=resource.business_unit_id
    )
    db.add(db_resource)
    db.commit()
    db.refresh(db_resource)
    return db_resource

def delete_resource(db: Session, resource_id: int):
    db_resource = db.query(models.Resource).filter(models.Resource.id == resource_id).first()
    if db_resource:
        db.delete(db_resource)
        db.commit()
    return db_resource

def update_resource_skills(db: Session, resource_id: int, skills_data: List[models.ResourceSkillUpdate]):
    db_resource = get_resource(db, resource_id)
    if not db_resource:
        return None

    # Clear existing skill links
    db_resource.skill_links.clear()

    # Add new skill links
    for skill_data in skills_data:
        # Check if the skill exists
        db_skill = get_skill(db, skill_data.skill_id)
        if not db_skill:
            raise ValueError(f"Skill with ID {skill_data.skill_id} not found.")

        # Create new link
        link = models.ResourceSkillLink(
            resource_id=resource_id,
            skill_id=skill_data.skill_id,
            level=skill_data.level,
        )
        # Imposta le label dal frontend (che sono già una lista)
        if skill_data.labels is not None:
            link.set_labels_from_list(skill_data.labels)

        db_resource.skill_links.append(link)

    db.commit()
    db.refresh(db_resource)
    return db_resource