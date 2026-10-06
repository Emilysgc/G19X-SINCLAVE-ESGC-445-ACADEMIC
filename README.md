# Sistema inteligente de solicitudes internas de personal
**PluriOne S.A. de C.V. — Develop Talent & Technology** · Proyecto de estadía

Automatiza vacaciones, permisos, constancias, cambios de información, incidencias de nómina y aprobaciones, con flujos de trabajo, reglas de negocio, notificaciones y agentes inteligentes.

El sistema inicia en estado limpio (sin usuarios precreados ni datos de prueba), listo para que configures los usuarios corporativos y roles directamente desde **Keycloak**.

| Tecnología | Uso en el proyecto | Estado |
|---|---|:---:|
| **Python + FastAPI** | API asíncrona, reglas de negocio, flujos multinivel y agentes (`backend/`) | ✅ Listo |
| **React.js** (Vite + SPA) | Interfaz web corporativa con inicio de sesión Keycloak OIDC (`frontend/`) | ✅ Listo |
| **PostgreSQL 16** | Base de datos relacional y modelo analítico para Power BI | ✅ Listo |
| **Redis 7** | Límite de intentos de acceso (rate limiting), invalidación de tokens y caché | ✅ Listo |
| **Keycloak 26** (OIDC) | Servidor de identidad y acceso unificado (SSO) con realm `rrhh` preconfigurado | ✅ Listo |
| **IA: Groq + Ollama** | Revisión inteligente de solicitudes y asistente de chat de RRHH con fallback a reglas | ✅ Listo |
| **Power BI** | Vistas SQL analíticas (`vw_*` y `dim_*`) y rol `powerbi_reader` | ✅ Listo |
| **Docker & Compose** | Orquestación completa de los servicios | ✅ Listo |
| **GitHub Actions** | Pipeline CI/CD automatizado (`.github/workflows/ci_cd.yml`) | ✅ Listo |

---

## 🚀 Puesta en Marcha con Docker Compose

### 1. Variables de entorno
Copia la plantilla y define tus contraseñas seguras:
```powershell
copy .env.example .env
```
En `.env`, asegúrate de configurar:
- `POSTGRES_PASSWORD`: Contraseña de PostgreSQL.
- `SECRET_KEY`: Clave secreta (genera una con `python -c "import secrets;print(secrets.token_urlsafe(48))"`).
- `KEYCLOAK_ADMIN`: Usuario administrador de Keycloak (por defecto `admin`).
- `KEYCLOAK_ADMIN_PASSWORD`: Contraseña del admin de Keycloak.
- `KEYCLOAK_DB_PASSWORD`: Contraseña de la base de datos de Keycloak.
- `POWERBI_DB_PASSWORD`: Contraseña para el usuario de solo lectura `powerbi_reader`.
- `GROQ_API_KEY`: Tu clave de [Groq Console](https://console.groq.com/keys) (opcional si usas solo Ollama o reglas).

### 2. Iniciar contenedores
Abre Docker Desktop y ejecuta:
```powershell
docker compose up -d --build
```
Espera aproximadamente 1 minuto a que Keycloak importe el realm e inicialice.

Direcciones de acceso:
- 🌐 **Sistema Web (Frontend):** [http://localhost](http://localhost)
- 🔐 **Consola de Keycloak:** [http://localhost:8080](http://localhost:8080)
- 📚 **Documentación API (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🔐 Guía Paso a Paso: Gestión de Usuarios en Keycloak

El contenedor de Keycloak ya incluye preconfigurado el realm **`rrhh`** y el cliente OpenID Connect **`rrhh-frontend`** con flujo PKCE.

### Paso 1: Ingresar a la consola de administración
1. Abre [http://localhost:8080](http://localhost:8080) en tu navegador.
2. Haz clic en **Administration Console**.
3. Inicia sesión con el usuario `admin` y la contraseña que pusiste en `KEYCLOAK_ADMIN_PASSWORD`.

### Paso 2: Seleccionar el Realm `rrhh`
En la esquina superior izquierda de la consola, haz clic en el selector de realms (por defecto dice `master`) y selecciona **`rrhh`**.

### Paso 3: Crear los usuarios
1. En el menú lateral izquierdo, ve a **Users** → **Add user** (o *Create user*).
2. Llena los campos:
   - **Username:** Nombre de usuario o correo (ej. `juan.perez@plurione.com`).
   - **Email:** Correo corporativo del empleado.
   - **First Name / Last Name:** Nombre y apellidos.
   - Marca **Email verified** en **ON**.
3. Haz clic en **Create**.

### Paso 4: Asignar contraseña
1. En la ficha del usuario recién creado, ve a la pestaña **Credentials**.
2. Haz clic en **Set password**.
3. Escribe la contraseña deseada y desmarca la opción **Temporary** (para no exigir cambio en el primer login).
4. Haz clic en **Save** → **Set password**.

### Paso 5: Asignar el rol al usuario
1. En la misma ficha del usuario, ve a la pestaña **Role mapping**.
2. Haz clic en **Assign role**.
3. Selecciona uno de los roles disponibles según el puesto:
   - **`EMPLOYEE`**: Empleado (puede crear solicitudes, ver sus saldos, chatear con el asistente).
   - **`MANAGER`**: Supervisor (puede ver y aprobar/rechazar solicitudes de sus subordinados).
   - **`HR_ADMIN`**: Administrador de Recursos Humanos (gestión de personal, constancias, reportes).
   - **`SYSTEM_ADMIN`**: Administrador del Sistema (acceso total y configuraciones).
4. Haz clic en **Assign**.

### Paso 6: Iniciar sesión en el sistema
1. Abre [http://localhost](http://localhost).
2. Haz clic en el botón principal **🔐 Iniciar sesión con Keycloak**.
3. Ingresa las credenciales del usuario creado en Keycloak.
4. El sistema autenticará el token OpenID Connect mediante PKCE, creará automáticamente el perfil del empleado en la base de datos si es nuevo, y le otorgará acceso con sus permisos correspondientes.

---

## 📊 Conexión con Power BI

El sistema crea automáticamente las vistas analíticas (`vw_solicitudes`, `vw_aprobaciones`, `vw_ausencias`, `dim_empleados`, `dim_departamentos`, etc.) y el usuario `powerbi_reader`:

1. En **Power BI Desktop**, selecciona **Obtener datos** → **Base de datos PostgreSQL**.
2. Servidor: `localhost:5432`, Base de datos: `hr_automation`, Modo: **Importar**.
3. Credenciales → pestaña **Base de datos** → Usuario: `powerbi_reader`, Contraseña: tu `POWERBI_DB_PASSWORD`.
4. Carga las vistas deseadas para diseñar tus tableros de control.

---

## 🧪 Pruebas Automatizadas (Pytest)

Para ejecutar la suite completa de pruebas unitarias y de integración:
```powershell
python -m pytest backend\tests -v
```
**Resultado:** **43 de 43 pruebas aprobadas (100% PASSED)**.

---

## 🔄 Integración Continua (CI/CD)

El repositorio incluye el pipeline [`.github/workflows/ci_cd.yml`](.github/workflows/ci_cd.yml) para validar automáticamente en GitHub:
- Ejecución de pruebas del backend con Pytest y reporte de cobertura.
- Compilación del frontend React con Vite.
- Validación sintáctica de Docker Compose y vistas SQL.
- Compilación de imágenes Docker para registro de contenedores.
