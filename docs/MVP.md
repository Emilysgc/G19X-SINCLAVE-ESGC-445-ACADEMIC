# Documento de Definición de Producto Mínimo Viable (MVP)
## Sistema Inteligente de Solicitudes Internas de Personal (RRHH)
**Organización:** PluriOne S.A. de C.V. — Develop Talent & Technology  
**Código del Proyecto:** G19X-SINCLAVE-ESGC-445-ACADEMIC  
**Versión del MVP:** 2.6.0 (Actualizado al 27 de Octubre de 2026)  
**Versión Inicial:** 1.0.0 (9 de Octubre de 2026)  

---

## 1. Resumen Ejecutivo

El presente documento describe el alcance funcional, técnico y operativo del **Producto Mínimo Viable (MVP)** del Sistema de Solicitudes Internas de Personal de **PluriOne S.A. de C.V.** Diseñado para transformar y automatizar la gestión operativa de Recursos Humanos, el sistema elimina trámites en papel, reduce los tiempos de respuesta mediante un motor de reglas y flujos de aprobación multinivel, garantiza el cumplimiento de la legislación laboral mexicana y proporciona visibilidad analítica en tiempo real.

---

## 2. Alcance Funcional del MVP

### 2.1. Autenticación, Seguridad y Recuperación de Accesos
* **Inicio de Sesión Híbrido:** Autenticación local mediante tokens JWT asimétricos e integración con **Keycloak 26** mediante OpenID Connect (OIDC / Authorization Code Flow con PKCE). Vinculación automática (*user linking*) de cuentas corporativas.
* **Recuperación Segura por Código OTP:**
  * Generación criptográfica de códigos numéricos de 6 dígitos con validez estricta de 10 minutos (almacenados con TTL en Redis).
  * Control de fuerza bruta: límite máximo de **3 intentos fallidos** antes de invalidar el código.
  * Plantilla de correo en codificación UTF-8 con soporte para tildes y caracteres especiales.
  * En entornos de producción, el código nunca se expone en los registros del contenedor (`logger.info` seguro).
  * Sincronización transparente de la nueva contraseña con el realm de Keycloak, notificando oportunamente al usuario y registrando cualquier contingencia en auditoría.
* **Seguridad y Cifrado:** Hashing de contraseñas con bcrypt (factor de trabajo calibrado), protección contra ataques de temporización (`dummy hash`), rate limiting distribuido por IP y por endpoint en Redis, y blacklist de tokens revocados.

### 2.2. Validación Bancaria Oficial (Estándar Banxico)
* **Validación Algorítmica de CLABE:** Para las solicitudes de cambio de cuenta de nómina, se exige una Clave Bancaria Estandarizada (CLABE) de 18 dígitos numéricos.
* **Dígito Verificador Módulo 10:** Implementación matemática del algoritmo oficial del **Banco de México (Banxico)** utilizando la serie periódica de pesos `[3, 7, 1]`.
* **Cifrado en Reposo:** La CLABE se almacena cifrada con el estándar simétrico Fernet (`AES-128-CBC`) en PostgreSQL y se expone únicamente enmascarada (`****1234`) tanto en la interfaz de usuario como en los registros de auditoría.
* **Doble Aprobación de RRHH:** Mecanismo de control interno antifraude que exige la autorización consecutiva de dos colaboradores diferentes con rol `HR_ADMIN`.

### 2.3. Gestión de Vacaciones y Saldo Legal (Reforma LFT 2023)
* **Vacaciones Dignas:** Cálculo dinámico y automatizado del derecho vacacional anual conforme al artículo 76 de la **Ley Federal del Trabajo (LFT)** reformado:
  * Año 1: 12 días laborables.
  * Año 2: 14 días laborables.
  * Año 3: 16 días laborables.
  * Año 4: 18 días laborables.
  * Año 5: 20 días laborables.
  * De 6 a 10 años: 22 días laborables (y progresión de +2 días por cada lustro subsecuente).
* **Deducción de Días Hábiles:** El motor calcula los días solicitados excluyendo fines de semana (sábados y domingos) y días de descanso obligatorio oficiales según el artículo 74 de la Ley Federal del Trabajo (1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 de mayo, 16 de septiembre, tercer lunes de noviembre, 1 de octubre sexenal y 25 de diciembre).
* **Prima Vacacional:** Cálculo y proyección automática del 25% de prima vacacional legalmente exigible (artículo 80 LFT).

### 2.4. Calendario Laboral, Actividades Persistentes y Gobernanza RBAC
* **Visualización de Ausencias:** Calendario interactivo mensual que refleja en tiempo real las solicitudes aprobadas (vacaciones, incapacidades, permisos y días de paternidad/maternidad).
* **Persistencia en Backend y Visibilidad Departamental:** Módulo de notas y actividades respaldadas en base de datos relacional (`calendar_notes`), permitiendo crear, consultar, editar (`PUT /users/me/calendar-notes/{id}`) y eliminar recordatorios con soporte de visibilidad (`visibility: 'PERSONAL' | 'DEPARTMENT' | 'GLOBAL'`), integradas con las ausencias del equipo.
* **Gobernanza de Publicación (RBAC 403):** La publicación de notas con visibilidad `GLOBAL` está restringida exclusivamente a `HR_ADMIN` y `SYSTEM_ADMIN` (retornando HTTP 403 para otros roles); las notas departamentales están delimitadas al propio departamento del colaborador salvo autorización de administradores.
* **Manejo Explícito de Respuestas y Errores:** La interfaz web procesa y despliega de inmediato cualquier rechazo o error del servidor (`Alert`), eliminando almacenamientos silenciosos simulados o eliminaciones locales no sincronizadas.

### 2.5. Flujos de Aprobación y Matriz de Autorización
* **Segregación de Funciones (RBAC):** Cuatro roles estrictos: `EMPLOYEE`, `MANAGER`, `HR_ADMIN` y `SYSTEM_ADMIN`.
* **Regla de Integridad de RRHH:** Ningún colaborador puede aprobar sus propios trámites (`requester_id != actor_id`). Las solicitudes creadas por un integrante de Recursos Humanos deben ser autorizadas por otro colega del departamento o por el Administrador del Sistema.
* **Motor de Auto-aprobación y SLA:** Aprobación automática e instantánea para trámites que cumplan con criterios predefinidos (e.g. constancias de trabajo y permisos con suficiente anticipación) y semáforo visual de SLA (verde, amarillo y rojo/vencido).

### 2.6. Asistente Virtual Inteligente (IA Híbrida)
* **Arquitectura de Inferencia Dual:**
  * **Groq Cloud:** Inferencia ultrarrápida impulsada por el modelo Llama 3.3 70B para atención inmediata de dudas sobre prestaciones y reglamentos.
  * **Ollama Local:** Contenedor local para inferencia soberana en entornos sin conectividad exterior.
  * **Motor Determinista:** Fallback instantáneo basado en reglas si ninguno de los servicios LLM está disponible.
* **Contexto Normativo:** Asistente alimentado con las 21 políticas laborales corporativas vigentes de PluriOne S.A. de C.V. y contextualizado a la zona horaria oficial (Ciudad de México).

### 2.7. Inteligencia de Negocio y Reportería (Power BI)
* **Esquema Analítico Dedicado:** Base de datos relacional equipada con vistas SQL optimizadas y libres de información sensible (`backend/sql/powerbi_views.sql`):
  * `vw_solicitudes`: Hechos transaccionales consolidados, tiempos de ciclo, cumplimiento binario de SLA y scores de auditoría.
  * `vw_aprobaciones`: Bitácora granular de pasos y etapas de autorización por trámite.
  * `vw_ausencias`: Serie temporal diaria de ausencias por colaborador y departamento (excluyendo fines de semana).
  * `vw_resumen_diario`: Métricas agrupadas por fecha y tipo de solicitud.
  * `vw_auditoria`: Registro de trazabilidad y eventos de modificación en el sistema.
  * `dim_empleados`: Dimensión de colaboradores con saldo de vacaciones y antigüedad.
  * `dim_departamentos`: Dimensión estructural de unidades organizacionales.
* **Usuario de Solo Lectura:** Credenciales dedicadas (`powerbi_reader`) con permisos restringidos exclusivamente a operaciones `SELECT` sobre el esquema analítico para salvaguardar la integridad de las tablas transaccionales.

---

## 3. Matriz Tecnológica Nuclear (10 Tecnologías)

| # | Tecnología | Categoría | Propósito en el MVP |
|:---:|---|---|---|
| **1** | **Python 3.11 / FastAPI** | Backend | API REST asíncrona de alto rendimiento, validaciones y lógica de negocio. |
| **2** | **React 18 / Vite** | Frontend | Interfaz SPA responsiva, panel ejecutivo Atlas y diseño accesible. |
| **3** | **PostgreSQL 16** | Base de Datos | Motor relacional transaccional, claves foráneas, índices y vistas analíticas. |
| **4** | **Redis 7** | Caché en Memoria | Gestión de sesiones, rate limiting, almacén temporal de códigos OTP y tokens. |
| **5** | **Keycloak 26** | Identidad y SSO | Proveedor de identidad OIDC/OAuth2 corporativo con realm `rrhh`. |
| **6** | **Groq (Llama 3.3)** | Inteligencia Artificial | Inferencia acelerada de lenguaje natural para consultas de colaboradores. |
| **7** | **Ollama** | Inteligencia Artificial | Respaldo local y privado para inferencia de modelos de lenguaje. |
| **8** | **Power BI** | Analítica de Datos | Dashboards directivos de rotación, tiempos de respuesta y cumplimiento de SLA. |
| **9** | **Docker & Compose** | Orquestación | Empaquetado estandarizado y reproducible de toda la infraestructura. |
| **10** | **GitHub Actions** | Integración Continua | Pipeline de pruebas automatizadas, linting y verificación de seguridad. |

---

## 4. Estrategia de Pruebas y Aseguramiento de Calidad

El MVP cuenta con una suite completa de **pruebas automatizadas con Pytest**, logrando una tasa de aprobación del 100%:
* **Cálculos y Algoritmos Matemáticos (4 pruebas):** Verificación del dígito de Banxico, cálculo de años de servicio, tabla LFT de vacaciones y días hábiles laborables excluyendo fines de semana y descansos obligatorios de la LFT.
* **Endpoints y Reglas de Negocio (34 pruebas):** Ciclo de vida completo de solicitudes, aprobación multinivel, auto-aprobación, cambio de CLABE bancaria cifrada, CRUD y visibilidad departamental de calendario, control de permisos RBAC (403 para publicación global no autorizada) y recuperación de contraseña vía OTP.
* **Integraciones y Resiliencia (10 pruebas):** Keycloak SSO, revocación en Redis, degradación elegante de IA hacia el motor de reglas y compatibilidad de base de datos.
* **Validación de IA (5 pruebas):** Verificación de system prompts corporativos, inyección de fecha y contención de solicitudes fuera de alcance.

---

## 5. Historial de Evolución del MVP

| Fecha | Versión | Cambios y Nuevas Capacidades Incorporadas |
|---|:---:|---|
| **09-Oct-2026** | 1.0.0 | Versión inicial del MVP: catálogo de solicitudes básicas, login local simple y tablas transaccionales en SQLite. |
| **14-Oct-2026** | 1.5.0 | Migración a PostgreSQL 16 y Docker Compose; incorporación de roles RBAC (`EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SYSTEM_ADMIN`). |
| **17-Oct-2026** | 2.0.0 | Integración de Keycloak 26 (OIDC/PKCE), vistas SQL para Power BI y asistente con Groq y Ollama. |
| **19-Oct-2026** | 2.1.0 | Algoritmo Banxico de CLABE de 18 dígitos, cifrado Fernet simétrico y doble aprobación para datos de nómina. |
| **20-Oct-2026** | 2.2.0 | Motor de vacaciones LFT (Reforma 2023), cálculo automático de antigüedad y prima vacacional del 25%. |
| **21-Oct-2026** | 2.3.0 | Módulo de calendario con persistencia en backend (`calendar_notes`), sincronización local y suite ampliada a 52 pruebas. |
| **22-Oct-2026** | 2.4.0 | Recuperación de contraseñas con OTP (Redis, 3 intentos, 10 min), logging seguro en producción, codificación UTF-8 estricta y rediseño de interfaz con nomenclatura semántica. |
| **23-Oct-2026** | 2.5.0 | Exclusión algorítmica de descansos obligatorios de la LFT en días hábiles (`utils.py`), eliminación total de datos simulados en analítica y modularización de estilos en arquitectura CSS semántica con `styles.css`. |
| **27-Oct-2026** | 2.6.0 | Control de acceso estricto RBAC en notas de calendario (403 para notas globales no autorizadas), edición y visibilidad en pantalla de calendario con manejo explícito de errores de servidor, ordenamiento dinámico y paginación reactiva en tabla de solicitudes del Dashboard, visualización de datos reales en Mi Perfil (remoción de placeholders simulados y campos no persistidos), eliminación total de identificadores de plantilla («Imagen N») y homologación de vistas analíticas SQL (`vw_solicitudes`, `vw_aprobaciones`, etc.). |
