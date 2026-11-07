# G19X-SINCLAVE-ESGC-445-ACADEMIC
## Sistema Inteligente de Solicitudes Internas de Personal (RRHH)
**PluriOne S.A. de C.V. — Develop Talent & Technology** · *Proyecto Académico TODO Academy*

Automatización integral de trámites laborales (vacaciones, permisos personales, incapacidades médicas, constancias de sueldo y trabajo, cambios de datos bancarios e incidencias de nómina) con flujos de aprobación multinivel, motor de reglas de negocio, cálculo de SLA, auditoría, inicio de sesión unificado con Keycloak (OIDC), integración con Power BI y agentes inteligentes con Groq y Ollama.

| Componente | Tecnología | Rol en la Arquitectura | Estado |
|---|---|---|:---:|
| **Backend** | Python 3.11 + FastAPI | API REST asíncrona, motor de reglas, workflows y agentes | Operativo |
| **Frontend** | React 18 + Vite | SPA corporativa con Dashboard ejecutivo Atlas y modo oscuro OLED | Operativo |
| **Identidad & SSO** | Keycloak 26 (OIDC/PKCE) | Autenticación centralizada con realm `rrhh` y roles RBAC | Operativo |
| **Base de Datos** | PostgreSQL 16 | Almacenamiento relacional, histórico y vistas SQL analíticas | Operativo |
| **Caché & Sesiones** | Redis 7 | Rate limiting, listas negras de tokens y sesiones | Operativo |
| **IA en Nube** | Groq (Llama 3.3 70B) | Inferencia ultrarrápida para consultas laborales con LLM en la nube | Operativo |
| **IA Local** | Ollama | Modelo de lenguaje local para fallback y soberanía de datos | Operativo |
| **Analítica** | Power BI | Vistas SQL analíticas (`vw_*` y `dim_*`) para tableros gerenciales | Operativo |
| **Orquestación** | Docker & Docker Compose | Contenerización completa de microservicios | Operativo |
| **CI/CD** | GitHub Actions | Pipeline automatizado de pruebas, análisis y empaquetado | Operativo |

> 📄 **Documentación Oficial del Proyecto:** Consulta la definición técnica y funcional completa en el [Documento del MVP (v2.6.0)](docs/MVP.md) y el [Documento de Requisitos de Producto (PRD)](PRD.md).

---

## Guía Rápida de Despliegue (Cómo Levantarlo en 3 Pasos)

### Requisitos Previos
- **Docker Desktop** instalado y en ejecución ([Descargar Docker](https://www.docker.com/products/docker-desktop/)).
- **Git** instalado en tu computadora.

---

### Paso 1: Clonar el repositorio
Abre una terminal (PowerShell, CMD o Terminal de Linux/macOS) y clona el proyecto:
```bash
git clone https://github.com/Emilysgc/G19X-SINCLAVE-ESGC-445-ACADEMIC.git
cd G19X-SINCLAVE-ESGC-445-ACADEMIC
```

---

### Paso 2: Crear el archivo de configuración `.env`
Copia la plantilla de variables de entorno lista para evaluación:

* **En Windows (PowerShell / CMD):**
  ```powershell
  copy .env.example .env
  ```
* **En Linux / macOS:**
  ```bash
  cp .env.example .env
  ```

> **Nota sobre credenciales de demostración:** El archivo `.env.example` y los usuarios de prueba contienen contraseñas de demostración preconfiguradas únicamente para facilitar la evaluación en local (`localhost`). No deben considerarse seguras para un entorno de producción real; en producción es indispensable sustituir todas las credenciales y secretos (`SECRET_KEY`, `POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, etc.) por valores de alta seguridad gestionados mediante un gestor de secretos corporativo.
> *(Opcional)*: Si deseas activar el asistente de IA con Groq en la nube, puedes agregar tu `GROQ_API_KEY` en el archivo `.env`. Si no la configuras, el sistema funcionará automáticamente con el motor de reglas y soporte para Ollama local.

---

### Paso 3: Levantar los contenedores con Docker Compose
Ejecuta el siguiente comando para compilar e iniciar todos los servicios:
```bash
docker compose up -d --build
```

> **Tiempo de espera estimado:** Aguarda entre **30 y 60 segundos** en el primer arranque para que PostgreSQL, Redis y Keycloak inicialicen e importen automáticamente el realm `rrhh`.
>
> **Nota para evaluadores con base de datos preexistente:**
> El sistema inicializa automáticamente su esquema relacional mediante `Base.metadata.create_all()` al iniciar el backend (sin herramientas de migración pesadas como Alembic para simplificar la evaluación). Si ya contabas con volúmenes locales previos de una ejecución anterior y deseas reiniciar la base de datos limpia con todas las tablas y datos semilla actualizados, ejecuta:
> ```bash
> docker compose down -v
> docker compose up -d --build
> ```

---

## Primer Acceso (Cuentas Disponibles por Rol)

Al concluir el `docker compose up`, el sistema cuenta con cuentas preconfiguradas e importadas automáticamente en el realm `rrhh` de Keycloak y sincronizadas con PostgreSQL. Puedes ingresar inmediatamente con cualquiera de ellas en **[http://localhost](http://localhost)**:

| Rol en el Sistema | Correo / Usuario | Contraseña | ¿Qué permite probar este usuario? |
|---|---|---|---|
| **Administrador / RRHH** (`HR_ADMIN`, `SYSTEM_ADMIN`) | `admin@plurione.com` *(o usuario `admin`)* | `Admin2026!` | Acceso total: catálogo de empleados, doble aprobación de CLABE, analítica y publicación de notas globales en el calendario. Creado automáticamente desde `FIRST_ADMIN_EMAIL` en `.env`. |
| **Supervisor / Líder** (`MANAGER`, `EMPLOYEE`) | `jefe.desarrollo@plurione.com` *(o usuario `jefe.desarrollo`)* | `temporal123` | Bandeja de aprobación: autorizar o rechazar solicitudes de su equipo y notas departamentales. Usuario de prueba importado desde `realm-rrhh.json`. |
| **Colaborador 1** (`EMPLOYEE`) | `empleado@plurione.com` *(o usuario `empleado`)* | `temporal123` | Autoservicio: crear solicitudes de vacaciones, permisos, chatear con el Asistente IA y agendar notas personales. |
| **Colaborador 2** (`EMPLOYEE`) | `empleado2@plurione.com` *(o usuario `empleado2`)* | `temporal123` | Mismo departamento (Tecnología); permite verificar que las notas departamentales se comparten entre compañeros y probar alertas de cobertura del 50%. |

#### Dos formas de iniciar sesión en [http://localhost](http://localhost):
1. **Vía Keycloak SSO (Recomendado):** Haz clic en el botón azul **«Iniciar sesión con Keycloak»** e introduce cualquiera de las credenciales de la tabla.
2. **Vía Acceso Local Directo:** Ingresa el correo (ej. `admin@plurione.com`) y contraseña (`Admin2026!`) en el formulario de la pantalla de bienvenida.

#### ¿Cómo conseguir un usuario nuevo de cada rol en Keycloak?
Si deseas crear usuarios adicionales personalizados desde la consola de identidades:
1. Entra a Keycloak: **[http://localhost:8080](http://localhost:8080)** con `admin` / `admin`.
2. En la esquina superior izquierda, cambia al realm **`rrhh`**.
3. Ve a **Users** → **Create user** (completa Nombre, Apellido, Correo institucional y marca **Email verified**).
4. En la pestaña **Credentials** → **Set password**, escribe la contraseña deseada y **desmarca la casilla Temporary**.
5. En la pestaña **Role mapping** → **Assign role**, asigna el rol deseado (`EMPLOYEE`, `MANAGER`, `HR_ADMIN` o `SYSTEM_ADMIN`).
6. Al iniciar sesión en **[http://localhost](http://localhost)** con esa nueva cuenta, el backend aprovisiona automáticamente su registro en la base de datos de PluriOne.

#### Gestión y preparación de departamentos desde la interfaz:
En una instalación limpia, el sistema inicializa automáticamente los departamentos base (**Tecnología** y **Recursos Humanos**), designando a `jefe.desarrollo` como responsable de Tecnología y asignando a `empleado` y `empleado2` dentro de dicho departamento con saldos iniciales de vacaciones (12 y 10 días). Para administrar departamentos o reasignar colaboradores manualmente:
1. Inicia sesión como administrador (`admin@plurione.com`).
2. Ve a **Administración** en la barra lateral.
3. En la pestaña de departamentos podrás crear nuevas áreas o cambiar supervisores, y en la pestaña de colaboradores podrás reasignar el departamento o jefe directo de cualquier empleado.

---

##  URLs de Acceso y Servicios

Una vez levantados los contenedores, accede a los siguientes puntos de entrada desde tu navegador:

| Servicio | URL | Descripción / Credenciales por defecto |
|---|---|---|
|  **Frontend Web (SPA)** | [http://localhost](http://localhost) | Interfaz gráfica de usuario principal de RRHH |
| **Keycloak SSO** | [http://localhost:8080](http://localhost:8080) | Consola de administración (Usuario: `admin` / Contraseña: `admin`) |
| **API REST (Backend)** | `http://localhost/api` | Enrutada vía proxy inverso Nginx (Swagger deshabilitado en producción por seguridad) |
| **PostgreSQL** | `localhost:5432` | BD: `hr_automation` (Usuario: `powerbi_reader` / Contraseña: `Alumno2026`) |
| **Redis** | `localhost:6379` | Gestor de sesiones, blacklist de tokens y rate limiting |

---

##  Guía Paso a Paso para Evaluadores (Cómo Probar el Sistema)

### 1. Autenticación y Cuentas Preconfiguradas

El sistema arranca con **usuarios listos para evaluación** (cuyos roles y contraseñas ya vienen preconfigurados en el realm `rrhh` de Keycloak y sincronizados con el backend):

| Rol en el Sistema | Correo de Acceso | Contraseña | Permisos y Alcance en la Evaluación |
|---|---|---|---|
| **Administrador / RRHH** (`HR_ADMIN`, `SYSTEM_ADMIN`) | `admin@plurione.com` | `Admin2026!` | Acceso total: gestión de empleados, doble aprobación de CLABE, analítica y publicación de notas globales. |
| **Supervisor / Líder** (`MANAGER`, `EMPLOYEE`) | `jefe.desarrollo@plurione.com` | `temporal123` | Aprobación de vacaciones y permisos de su equipo en la bandeja de aprobación. |
| **Colaborador 1** (`EMPLOYEE`) | `empleado@plurione.com` | `temporal123` | Solicitudes de vacaciones, permisos, consultas al Asistente IA y notas de calendario. |
| **Colaborador 2** (`EMPLOYEE`) | `empleado2@plurione.com` | `temporal123` | Mismo departamento (Tecnología); permite verificar notas departamentales compartidas y alertas de cobertura. |

#### Formas de Iniciar Sesión en [http://localhost](http://localhost):
* **Opción A (Recomendada - SSO con Keycloak):** Haz clic en el botón azul **«Iniciar sesión con Keycloak»**. El navegador te llevará a la pantalla institucional de Keycloak; ingresa cualquiera de las cuentas de la tabla anterior.
* **Opción B (Acceso Local Directo):** En la misma pantalla de bienvenida, ingresa el correo (ej. `admin@plurione.com`) y contraseña (`Admin2026!`) en el formulario inferior y haz clic en **«Entrar con correo y contraseña»**.

#### Cómo crear usuarios adicionales con otros roles en Keycloak:
Si deseas dar de alta un usuario nuevo desde la consola de identidad:
1. Ingresa a la consola administrativa de Keycloak: [http://localhost:8080](http://localhost:8080) con `admin` / `admin`.
2. En la esquina superior izquierda, cambia del realm `master` al realm **`rrhh`**.
3. En la sección **Users** → **Create user**: ingresa Nombre, Apellido, Correo y activa la casilla **Email verified**.
4. En la pestaña **Credentials** → **Set password**: escribe la contraseña deseada y **desmarca la casilla Temporary**.
5. En la pestaña **Role mapping** → **Assign role**: selecciona el rol asignado (`EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SYSTEM_ADMIN`).
6. Al iniciar sesión por primera vez con esa cuenta en [http://localhost](http://localhost), el backend aprovisiona automáticamente su registro en la base de datos de PluriOne.

---

### 2. Módulos y Funcionalidades para Evaluar en la Web

1. **Dashboard Ejecutivo Atlas:**
   * Visualiza tarjetas KPI interactivas con indicadores de rendimiento, métricas de solicitudes y tiempos de respuesta.
   * Gráficos circulares (donuts) de eficiencia y cumplimiento de SLA.
   * Tabla dinámica de solicitudes recientes con filtros rápidos por estado (*Todas, Aprobadas, En revisión, Pendientes*), ordenamiento interactivo y paginación reactiva.

2. **Modo Oscuro Puro (#000000) y Modo Claro:**
   * En la barra superior, haz clic en el botón de **Sol / Luna** para alternar instantáneamente entre el tema claro ejecutivo y el modo oscuro en negro puro OLED de alto contraste.

3. **Creación y Validación de Solicitudes:**
   * Dirígete a **Nueva solicitud** en el menú lateral.
   * Prueba crear solicitudes de **Vacaciones**, **Permisos personales** o **Incapacidades médicas**.
   * El sistema valida en tiempo real las reglas de negocio (anticipación mínima, días disponibles, solapamiento de fechas y porcentaje de cobertura del equipo).

4. **Calendario Interactivo, Visibilidad de Notas y Permisos RBAC:**
   * Abre la sección **Calendario**.
   * Visualiza el mes actual en español con días y semanas localizadas.
   * **Selección con color:** Haz clic sobre cualquier día de la cuadrícula para seleccionarlo y consultar ausencias programadas y eventos.
   * **Agregar notas con visibilidad por rol:** Haz clic en **+ Agregar actividad o nota**:
     * **Personal:** Solo visible para el usuario que la creó.
     * **Departamental:** Visible para todos los integrantes del mismo departamento. *(Para probarlo: crea una nota departamental con `empleado@plurione.com`, cierra sesión e ingresa con `empleado2@plurione.com`; ambos verán la nota en el calendario)*.
     * **Global:** Visible para toda la empresa en el calendario. **Solo permitida para roles administrativos (`HR_ADMIN` y `SYSTEM_ADMIN`)**.
   * **Prueba de seguridad RBAC (Control 403 Forbidden):**
     * Si un empleado estándar (`EMPLOYEE`) intenta seleccionar y publicar una nota con visibilidad **Global**, el sistema rechaza la operación con código **HTTP 403 Forbidden** (*"Solo administradores de RRHH y del sistema pueden publicar notas con visibilidad global"*).
   * **Edición y eliminación de notas:**
     * Al hacer clic sobre cualquier nota existente, se despliega su modal de detalle.
     * Si el usuario es el dueño de la nota o administrador de RRHH, podrá ver los botones **Editar actividad** (para modificar título, fecha, tipo o visibilidad) y **Eliminar actividad**.
     * Al editar una nota, el autor original se preserva fielmente. Si la nota pertenece a otro usuario de otro departamento, los botones no se muestran y cualquier intento de borrado es bloqueado por el servidor con código **HTTP 403**.

5. **Asistente de IA en Pantalla Completa:**
   * En la barra superior haz clic en el botón **Asistente IA**.
   * Se abrirá el asistente en pantalla completa con diseño moderno estilo Script.io.
   * Puedes interactuar mediante preguntas sobre políticas laborales (*ej. "¿Con cuántos días de anticipación debo pedir mis vacaciones?"* o *"¿Cuál es mi saldo disponible?"*).
   * Permite alternar entre **Groq (nube)** y **Ollama (local)** en el selector superior.

6. **Bandeja de Aprobación (Workflow):**
   * Con un usuario con rol `MANAGER` o `HR_ADMIN`, ingresa a **Bandeja de aprobación**.
   * Revisa las solicitudes pendientes de subordinados y realiza la aprobación o rechazo justificado.

7. **Configuración de Cuenta y Perfil:**
   * Haz clic en el avatar de usuario en la esquina superior derecha o en la barra lateral para abrir la configuración.
   * Permite actualizar nombre, correo, cambiar contraseñas y subir una foto de perfil personalizada.

---

## Conexión con Power BI

El sistema genera automáticamente el esquema analítico para reportes de Business Intelligence:

1. Abre **Power BI Desktop** y selecciona **Obtener datos** → **PostgreSQL**.
2. **Servidor:** `localhost:5432` | **Base de datos:** `hr_automation` | **Modo:** *Importar*.
3. En la autenticación por base de datos:
   * **Usuario:** `powerbi_reader`
   * **Contraseña:** `Alumno2026` (o la configurada en `POWERBI_DB_PASSWORD`)
4. Selecciona las vistas analíticas preparadas:
   * `vw_solicitudes` (detalles y métricas de solicitudes).
   * `vw_aprobaciones` (historial y tiempos de respuesta).
   * `vw_ausencias` (calendario y ausentismo).
   * `dim_empleados` y `dim_departamentos`.

---

## Pruebas Automatizadas (Pytest)

Para ejecutar la suite completa de pruebas unitarias y de integración en el entorno de desarrollo:

```bash
pytest backend/tests/ -v
# En Windows:
py -3.11 -m pytest backend/tests/ -v
```

*(Nota: La imagen de producción `Dockerfile.backend` está optimizada y endurecida para despliegue mínimo, por lo que las dependencias de testing y la carpeta `tests/` se ejecutan en el entorno de desarrollo con `pytest`)*.

> **Resultado:** **54 pruebas automatizadas con Pytest (53 aprobadas y 1 omitida en SQLite por validar vistas analíticas nativas de PostgreSQL)** cubriendo:
> - **Pruebas unitarias (`test_units.py` - 4 pruebas):** Cálculo de días hábiles laborables excluyendo fines de semana y descansos obligatorios de la LFT (Art. 74), tabla de antigüedad y validación matemática de CLABE (estándar Banxico módulo-10).
> - **API y reglas de negocio (`test_api.py` - 34 pruebas):** Autenticación, creación de solicitudes, prevención de empalmes, permisos con auto-aprobación, aprobación multinivel de vacaciones, cifrado de datos sensibles, control de permisos RBAC en notas de calendario (403), CRUD y visibilidad departamental, descargas seguras y vistas analíticas.
> - **Integraciones y resiliencia (`test_integrations.py` - 11 pruebas):** Keycloak OIDC, linking de usuarios SSO, alternancia automática de proveedores de IA y degradación elegante al motor de reglas.
> - **Comportamiento del Agente de IA (`test_ai_agent_behavior.py` - 5 pruebas):** Inyección de fecha Ciudad de México, system prompt estructurado con alcance/reglas/ejemplos, filtro de solicitudes fuera de alcance y parámetros de inferencia.

---

## Decisiones de Arquitectura y Tecnologías

### 1. ¿Por qué Keycloak en lugar de Microsoft Entra ID (Azure AD)?
- **Costo y accesibilidad:** Microsoft Entra ID es una solución propietaria de pago que requiere una suscripción corporativa activa a Microsoft Azure y licencias por usuario.
- **Soberanía y ejecución local:** Keycloak es un servidor de identidad Open Source maduro, estándar en la industria y compatible al 100% con OIDC (OpenID Connect) y OAuth 2.0. Permite empaquetar todo el entorno en Docker Compose con persistencia en PostgreSQL, funcionando tanto en local sin internet como en la nube, sin ningún costo recurrente.

### 2. ¿Por qué Groq y Ollama en lugar de Azure OpenAI Service?
- **Costo cero y reproducibilidad:** Azure OpenAI Service exige una tarjeta bancaria corporativa, contrato empresarial y facturación por token consumido, limitando la reproducibilidad del proyecto para fines de evaluación.
- **Estrategia híbrida de IA:**
  - **Groq (Nube):** Ofrece un *free tier* con inferencia ultra-rápida (LPU) ejecutando modelos de código abierto como Llama 3.3 y Qwen 2.5 mediante una API estándar compatible con OpenAI.
  - **Ollama (Local):** Permite ejecutar modelos locales (ej. `llama3.1:8b`) directamente en el servidor sin costo y garantizando privacidad total y funcionamiento offline.
  - **Motor de Reglas Determinista (Fallback):** Si no hay conexión o se agotan las cuotas de IA, el sistema conmuta automáticamente al motor de reglas en Python para evaluar las políticas laborales sin interrumpir el servicio.

---

## Uso de Inteligencia Artificial en el Desarrollo del Proyecto

Durante el ciclo de desarrollo de esta solución se utilizó Inteligencia Artificial Generativa bajo la metodología de **programación en pareja asistida por IA (Pair Programming con agentes autónomos)**:
1. **Modelado y Arquitectura:** Asistencia en el diseño del modelo entidad-relación relacional en SQLAlchemy, esquemas estrictos de validación con Pydantic (`extra="forbid"`) y diseño de máquinas de estado para los flujos de aprobación.
2. **Políticas Laborales Corporativas:** Generación, adaptación y calibración de las 21 políticas laborales oficiales de **PluriOne S.A. de C.V.**, fundamentadas en la Ley Federal del Trabajo de México (LFT).
3. **Generación y Cobertura de Pruebas:** Redacción colaborativa de los casos de prueba con Pytest, incluyendo la validación algorítmica de CLABE interbancaria, escenarios de escalamiento de SLA y mitigación de vectores de ataque como inyección de scripts (XSS).
4. **Auditoría de Seguridad:** Detección y corrección de riesgos de seguridad, tales como el aislamiento estricto del almacenamiento de adjuntos, validación binaria de firmas de archivos (números mágicos) para avatares y cifrado simétrico Fernet para datos financieros.

---

## Comandos de Mantenimiento

* **Ver registros (logs) en tiempo real:**
  ```bash
  docker compose logs -f
  ```
* **Ver registros de un servicio específico (ej. backend o keycloak):**
  ```bash
  docker compose logs -f backend
  docker compose logs -f keycloak
  ```
* **Reiniciar un contenedor:**
  ```bash
  docker compose restart frontend backend
  ```
* **Detener los servicios:**
  ```bash
  docker compose down
  ```
* **Detener eliminando volúmenes (reinicio desde cero):**
  ```bash
  docker compose down -v
  ```
