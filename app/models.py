from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

from .database import Base

# --- Modelli SQLAlchemy (Tabelle del Database) ---

# Tabella di associazione per la relazione Many-to-Many tra Risorse e Skills
# Contiene anche il livello della competenza.
class ResourceSkillLink(Base):
    __tablename__ = 'resource_skill_link'
    resource_id: Mapped[int] = mapped_column(ForeignKey('resources.id'), primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey('skills.id'), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Relazioni per accedere agli oggetti Resource e Skill direttamente dal link
    skill: Mapped["Skill"] = relationship(back_populates="resource_links")

class Resource(Base):
    __tablename__ = "resources"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    cognome: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    numero: Mapped[Optional[str]] = mapped_column(String(50))
    
    business_unit_id: Mapped[int] = mapped_column(ForeignKey('business_units.id'))
    business_unit: Mapped["BusinessUnit"] = relationship(back_populates="resources")
    
    # La relazione 'skills' non è più necessaria qui, usiamo 'skill_links'
    skill_links: Mapped[List["ResourceSkillLink"]] = relationship(cascade="all, delete-orphan")

class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    
    resource_links: Mapped[List["ResourceSkillLink"]] = relationship(back_populates="skill", cascade="all, delete-orphan")

class BusinessUnit(Base):
    __tablename__ = "business_units"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    
    resources: Mapped[List["Resource"]] = relationship(back_populates="business_unit")


# --- Modelli Pydantic (Validazione Dati API) ---

# Configurazione comune per i modelli Pydantic
orm_config = ConfigDict(from_attributes=True)

# Skill
class SkillBase(BaseModel):
    name: str

class SkillCreate(SkillBase):
    pass

class SkillSchema(SkillBase):
    id: int
    model_config = orm_config

# Business Unit
class BusinessUnitBase(BaseModel):
    name: str

class BusinessUnitCreate(BusinessUnitBase):
    pass

class BusinessUnitSchema(BusinessUnitBase):
    id: int
    model_config = orm_config
    
class BuDeleteOptions(BaseModel):
    action: str # 'migrate' o 'delete'
    target_bu_id: Optional[int] = None

# Resource
class ResourceSkillSchema(BaseModel):
    skill_id: int
    level: int
    name: str # Nome della skill per comodità nel frontend
    model_config = orm_config

class ResourceBase(BaseModel):
    nome: str
    cognome: str
    email: str
    numero: Optional[str] = None
    business_unit_id: int

class ResourceCreate(ResourceBase):
    pass

# Schema per la risposta, per mostrare i dati in modo più leggibile
class ResourceSchema(BaseModel):
    id: int
    nome: str
    cognome: str
    email: str
    numero: Optional[str] = None
    business_unit: BusinessUnitSchema
    skills: List[ResourceSkillSchema]
    model_config = orm_config

class ResourceSkillUpdate(BaseModel):
    skill_id: int
    level: int
