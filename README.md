# G19X-SINCLAVE-ESGC-445-ACADEMIC
## Sistema Inteligente de Solicitudes Internas de Personal (RRHH)
**PluriOne S.A. de C.V. — Develop Talent & Technology** · *Proyecto Académico TODO Academy*

Automatización integral de trámites laborales (vacaciones, permisos personales, incapacidades médicas, constancias de sueldo y trabajo, cambios de datos bancarios e incidencias de nómina) con flujos de aprobación multinivel, motor de reglas de negocio, cálculo de SLA, auditoría, inicio de sesión unificado con Keycloak (OIDC), integración con Power BI y agentes inteligentes con Groq y Ollama.

| Componente | Tecnología | Rol en la Arquitectura | Estado |
|---|---|---|:---:|
| **Backend** | Python 3.11 + FastAPI | API REST asíncrona, motor de reglas, workflows y agentes |  Operativo |
| **Frontend** | React 18 + Vite | SPA corporativa con Dashboard ejecutivo Atlas y modo oscuro OLED |  Operativo |
| **Identidad & SSO** | Keycloak 26 (OIDC/PKCE) | Autenticación centralizada con realm `rrhh` y roles RBAC | Operativo |
| **Base de Datos** | PostgreSQL 16 | Almacenamiento relacional, histórico y vistas SQL analíticas | Operativo |
| **Caché & Sesiones** | Redis 7 | Rate limiting, listas negras de tokens y sesiones | Operativo |
| **Inteligencia Artificial**| Groq (Llama 3.3) + Ollama | Asistente de consultas laborales y validación inteligente |  Operativo |
| **Analítica** | Power BI | Vistas SQL analíticas (`vw_*` y `dim_*`) para tableros gerenciales | Operativo |
| **Orquestación** | Docker & Docker Compose | Contenerización completa de microservicios | Operativo |
| **CI/CD** | GitHub Actions | Pipeline automatizado de pruebas, análisis y empaquetado | Operativo |

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

>  **Nota sobre credenciales:** El archivo `.env.example` ya incluye contraseñas seguras y configuraciones por defecto para levantar todos los contenedores de inmediato sin requerir ediciones manuales.
> *(Opcional)*: Si deseas activar el asistente de IA con Groq en la nube, puedes agregar tu `GROQ_API_KEY` en el archivo `.env`. Si no la configuras, el sistema funcionará automáticamente con el motor de reglas y soporte para Ollama local.

---

### Paso 3: Levantar los contenedores con Docker Compose
Ejecuta el siguiente comando para compilar e iniciar todos los servicios:
```bash
docker compose up -d --build
```

> **Tiempo de espera estimado:** Aguarda entre **30 y 60 segundos** en el primer arranque para que PostgreSQL, Redis y Keycloak inicialicen e importen automáticamente el realm `rrhh`.

---

##  URLs de Acceso y Servicios

Una vez levantados los contenedores, accede a los siguientes puntos de entrada desde tu navegador:

| Servicio | URL | Descripción / Credenciales por defecto |
|---|---|---|
|  **Frontend Web (SPA)** | [http://localhost](http://localhost) | Interfaz gráfica de usuario principal de RRHH |
| **Keycloak SSO** | [http://localhost:8080](http://localhost:8080) | Consola de administración (Usuario: `admin` / Contraseña: `admin`) |
| **Documentación API (Swagger)** | [http://localhost:8000/docs](http://localhost:8000/docs) | Endpoints interactivos de FastAPI y esquemas OpenAPI |
| **PostgreSQL** | `localhost:5432` | BD: `hr_automation` (Usuario: `powerbi_reader` / Contraseña: `Alumno2026`) |
| **Redis** | `localhost:6379` | Gestor de sesiones, blacklist de tokens y rate limiting |

---

##  Guía Paso a Paso para Evaluadores (Cómo Probar el Sistema)

### 1. Autenticación y Usuarios
El sistema cuenta con soporte para inicio de sesión unificado con **Keycloak**:

1. Ingresa a la consola de Keycloak: [http://localhost:8080](http://localhost:8080) con `admin` / `admin`.
2. En la esquina superior izquierda, cambia del realm `master` al realm **`rrhh`**.
3. En la sección **Users**, puedes crear nuevos usuarios o gestionar los existentes:
   * **Crear usuario:** Ingresa Nombre, Apellido, Correo y activa **Email verified**.
   * **Contraseña:** En la pestaña **Credentials**, haz clic en **Set password**, escribe la contraseña deseada y desmarca la casilla **Temporary**.
   * **Rol:** En la pestaña **Role mapping** → **Assign role**, asigna el rol deseado:
     * `EMPLOYEE`: Puede crear solicitudes, consultar sus saldos y chatear con el asistente IA.
     * `MANAGER`: Supervisor; revisa y aprueba/rechaza solicitudes de su equipo.
     * `HR_ADMIN`: Recursos Humanos; gestión de empleados, departamentos, constancias y reportes.
     * `SYSTEM_ADMIN`: Acceso total a todas las configuraciones y módulos.
4. Abre [http://localhost](http://localhost) e inicia sesión con el botón **🔐 Iniciar sesión con Keycloak**.

---

### 2. Módulos y Funcionalidades para Evaluar en la Web

1. **Dashboard Ejecutivo Atlas:**
   * Visualiza tarjetas KPI interactivas con indicadores de rendimiento, métricas de solicitudes y tiempos de respuesta.
   * Gráficos circulares (donuts) de eficiencia y cumplimiento de SLA.
   * Tabla dinámica de solicitudes recientes con filtros rápidos por estado (*Todas, Aprobadas, En revisión, Pendientes*).

2. **Modo Oscuro Puro (#000000) y Modo Claro:**
   * En la barra superior, haz clic en el botón de **Sol / Luna** para alternar instantáneamente entre el tema claro ejecutivo y el modo oscuro en negro puro OLED de alto contraste.

3. **Creación y Validación de Solicitudes:**
   * Dirígete a **Nueva solicitud** en el menú lateral.
   * Prueba crear solicitudes de **Vacaciones**, **Permisos personales** o **Incapacidades médicas**.
   * El sistema valida en tiempo real las reglas de negocio (anticipación mínima, días disponibles, solapamiento de fechas y porcentaje de cobertura del equipo).

4. **Calendario Interactivo con Actividades:**
   * Abre la sección **Calendario**.
   * Visualiza el mes actual en español con días y semanas localizadas.
   * **Selección con color:** Haz clic sobre cualquier día de la cuadrícula para pintarlo y seleccionarlo activamente.
   * **Notas y Actividades:** Haz clic en **+ Agregar actividad o nota** para agendar notas personales o recordatorios que se guardan y reflejan en el calendario.

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

Para ejecutar la suite completa de pruebas unitarias y de integración directamente en el contenedor backend:

```bash
docker compose exec backend pytest tests/ -v
```

> **Resultado:** **43 de 43 pruebas aprobadas (100% PASSED)** cubriendo autenticación OIDC, reglas de negocio, flujos de aprobación y comportamiento de agentes IA.

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
