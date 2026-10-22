# Documento de Requisitos de Producto (PRD)
## Sistema de Automatización de Solicitudes Internas de Personal
**Empresa:** PluriOne S.A. de C.V. (Develop Talent & Technology)  
**Versión:** 2.0.0  
**Fecha de actualización:** 20 de Octubre de 2026  

---

## 1. Visión y Objetivos del Proyecto

Automatizar de extremo a extremo la recepción, validación, enrutamiento, aprobación y seguimiento de los trámites y solicitudes internas de los colaboradores de **PluriOne S.A. de C.V.** mediante flujos de aprobación multinivel, agentes de inteligencia artificial y analítica en tiempo real para Business Intelligence.

---

## 2. Matriz de Roles y Segregación de Funciones

Para garantizar el principio de mínimo privilegio y auditoría estricta, el sistema define cuatro roles claramente delimitados:

| Rol | Alcance y Responsabilidades |
|---|---|
| **EMPLOYEE (Colaborador)** | Creación de solicitudes de vacaciones, permisos, incidencias y constancias. Consulta del expediente personal y saldo LFT. Interacción con el asistente de IA para resolver dudas de políticas internas. |
| **MANAGER (Líder / Supervisor)** | Aprobación o rechazo fundamentado de las solicitudes del personal a su cargo directo. Consulta de ausencias de su equipo sin acceso a datos médicos sensibles ni constancias de sueldo. |
| **HR_ADMIN (Recursos Humanos)** | Gestión del catálogo de colaboradores y departamentos. Edición y administración de las **Políticas Laborales**, configuración de **Tipos de Trámite**, reglas de **Auto-aprobación** y parámetros de **SLA**. Revisión de comprobantes adjuntos, constancias y aprobación final. |
| **SYSTEM_ADMIN (Administrador del Sistema)** | Soporte técnico, monitoreo de salud de contenedores (PostgreSQL, Redis, Keycloak), verificación de integraciones (Groq/Ollama, Power BI) y asignación exclusiva de roles administrativos (`HR_ADMIN` y `SYSTEM_ADMIN`). |

---

## 3. Reglas de Negocio y Seguridad en Flujos de Aprobación

### 3.1. Aprobación de Solicitudes del Área de Recursos Humanos
> **Regla de integridad:**  
> **Las solicitudes de RRHH las aprueba otro integrante de RRHH o el administrador; nadie aprueba las suyas.**
- Ningún usuario, independientemente de su jerarquía o rol administrativo, puede autoaprobar o autorizar sus propias solicitudes (`requester_id != actor_id`).
- Se requiere la existencia de al menos dos integrantes con rol `HR_ADMIN` para permitir la revisión cruzada de trámites de personal del propio departamento de Recursos Humanos.
- El colaborador de RRHH puede tener asignado un supervisor directo (por ejemplo, Director de Operaciones o Dirección General); sus solicitudes transitan por el visto bueno de su líder y la validación de un segundo colega de RRHH o el Administrador del Sistema.

### 3.2. Validación Matemática de CLABE Interbancaria (Estándar Banxico)
- Las solicitudes de **Cambio de Cuenta Bancaria** exigen una cuenta CLABE de exactamente 18 dígitos numéricos.
- **Cálculo del Dígito Verificador:** Se valida matemáticamente el dígito 18 mediante el algoritmo oficial de **Banco de México (Banxico)**: ponderación módulo 10 con pesos cíclicos `[3, 7, 1]`. Cualquier CLABE inventada o con dígito incorrecto es rechazada a nivel esquema (HTTP 422).
- **Doble Validación:** Por motivos de seguridad contra fraude interno, el cambio de cuenta bancaria exige la aprobación sucesiva de **dos integrantes distintos de RRHH** antes de aplicarse en nómina.
- **Cifrado en Reposo:** La CLABE original se almacena cifrada simétricamente mediante Fernet (`AES-128-CBC`) y solo se expone enmascarada (`****1234`) para el usuario y en auditoría.

### 3.3. Gestión Exclusiva de Políticas y Trámites
- Las rutas `POST /admin/policies`, `PUT /admin/policies/{id}`, `DELETE /admin/policies/{id}` y `PATCH /admin/request-types/{rtype}` son de acceso **exclusivo para `HR_ADMIN`**.
- El rol `SYSTEM_ADMIN` tiene restringida la modificación de reglas de negocio, garantizando que el departamento de Recursos Humanos sea el único dueño de las políticas de la empresa.
- **Persistencia en Reinicio:** La función de inicialización `ensure_defaults` verifica la existencia de políticas por título y respeta las ediciones y estados (activas/inactivas) realizados por RRHH, evitando sobrescrituras al reiniciar los servicios.

### 3.4. Almacenamiento Seguro y Aislamiento de Archivos
- El directorio `/uploads` está cerrado al acceso público anónimo.
- Los avatares de usuario se sirven de manera aislada desde `/uploads/avatars/` previa validación estricta de extensiones permitidas (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) y verificación binaria de firmas de archivo (números mágicos).
- Los documentos confidenciales (recetas médicas, constancias de sueldo, comprobantes de domicilio) únicamente se descargan mediante endpoints autenticados y autorizados con firma criptográfica.

---

## 4. Decisiones Tecnológicas y Justificación de Arquitectura

### 4.1. Keycloak vs. Microsoft Entra ID (Azure AD)
- **Costo e Independencia:** Entra ID impone costos recurrentes por licenciamiento por usuario y dependencia de la nube propietaria de Microsoft. Keycloak proporciona una solución Open Source robusta, estándar OIDC/OAuth2 y auto-alojada en Docker con PostgreSQL, garantizando reproducibilidad local y costo operativo cero.

### 4.2. Groq y Ollama vs. Azure OpenAI Service
- **Flexibilidad Híbrida y Privacidad:** Azure OpenAI genera costos por token y requiere conexión externa permanente. La combinación de **Groq** (inferencia acelerada en la nube con Llama 3) y **Ollama** (ejecución 100% local y offline de modelos LLM) proporciona alta disponibilidad, soberanía de datos y fallback inmediato hacia el motor de reglas determinista en caso de fallas de red.

---

## 5. Control de Calidad y Pruebas Automatizadas
La suite de pruebas automatizadas en Pytest consta de **51 pruebas** cubriendo:
1. **Unidades (`test_units.py`):** Días hábiles LFT, cálculo de vacaciones por antigüedad y algoritmo Banxico de CLABE.
2. **API y Seguridad (`test_api.py`):** Matriz de accesos, bloqueo de autoedición de expediente, recuperación de contraseña con código OTP (10 min y 3 intentos), flujos multinivel y restricciones de rol.
3. **Integraciones (`test_integrations.py`):** Resiliencia de proveedores de IA, sincronización SSO con Keycloak y caché distribuida en Redis.
4. **Agente Inteligente (`test_ai_agent_behavior.py`):** System prompt corporativo contextualizado a PluriOne S.A. de C.V., delimitación estricta de alcance y zona horaria de Ciudad de México.
