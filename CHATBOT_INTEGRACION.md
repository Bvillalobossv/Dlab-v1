# Integración de Datos de Supabase en el Chatbot de Lia

## Problema Resuelto
El chatbot de OpenAI (Lia) no estaba usando los datos guardados en Supabase para responder. Ahora, tanto para trabajadores como para empleadores, el asistente Lia considera la información del usuario/equipo en sus respuestas.

## Cómo Funciona

### 1. **Frontend (app.js)**

Se agregaron tres funciones helper:

```javascript
// Obtiene el equipo/departamento del usuario (si es empleador)
function getCurrentTeamName() {
  return state.context?.area || null;
}

// Detecta si el usuario es empleador (tiene un equipo/departamento)
function isCurrentUserEmployer() {
  return getCurrentTeamName() !== null;
}
```

### 2. **Lógica del Chat**

Cuando el usuario envía un mensaje a Lia:

1. **Se detecta si es empleador o trabajador**
   - Si tiene `state.context.area` (departamento) → Es empleador
   - Si no → Es trabajador

2. **Se usa el endpoint correcto**
   - **Empleador**: `/api/employer-assistant` + envía `teamName`
   - **Trabajador**: `/api/lia-chat` + envía `workerId`

3. **El backend obtiene los datos de Supabase**
   - Consulta mediciones y perfiles del usuario/equipo
   - Incluye esos datos en el prompt de OpenAI
   - OpenAI responde basado en información real

### 3. **Backend (server.js)**

Existen dos funciones de contexto:

#### `getWorkerContextFromSupabase(workerId)`
- Obtiene las últimas 8 mediciones del trabajador
- Calcula promedio de bienestar, estrés, tendencias
- Ejemplo de información enviada a OpenAI:
  ```
  DATOS DEL USUARIO (Supabase):
  - Última medición: 28/11/2025 14:30.
  - Score bienestar actual: 65 (riesgo BAJO)
  - Promedio histórico reciente: 70.
  - Tendencia al alza (mejorando).
  - Nivel de estrés reportado: 6/10
  ```

#### `getTeamContextFromSupabase(teamName)`
- Obtiene empleados del departamento
- Busca sus mediciones en últimos 15 días
- Calcula promedios del equipo
- Ejemplo de información:
  ```
  DATOS DEL EQUIPO "Ventas" (Últimos 15 días):
  - Personas activas evaluadas: 5.
  - Promedio de Bienestar del Equipo: 58 (riesgo MEDIO).
  - Promedio de Estrés: 7.2/10.
  - Personas en "Zona Crítica" (Riesgo Alto): 2 de 5.
  ```

## Flujo Completo

```
Usuario (Trabajador o Empleador)
    ↓
Chat de Lia (Frontend)
    ↓
¿Tiene state.context.area?
    ├─ Sí (Empleador)
    │   ├─ URL: /api/employer-assistant
    │   └─ Body: { messages, teamName }
    │       ↓
    │   Backend: getTeamContextFromSupabase(teamName)
    │       ↓
    │   OpenAI recibe: Contexto del equipo + mensajes
    │
    └─ No (Trabajador)
        ├─ URL: /api/lia-chat
        └─ Body: { messages, workerId }
            ↓
        Backend: getWorkerContextFromSupabase(workerId)
            ↓
        OpenAI recibe: Contexto del trabajador + mensajes
            ↓
        Respuesta personalizada
```

## Estructura de Datos en Supabase

### Tabla: `profiles`
```sql
- id (UUID, PK)
- email
- department (VARCHAR) -- Nombre del equipo/departamento
- ... otros campos
```

### Tabla: `measurements`
```sql
- id (UUID, PK)
- user_id_uuid (UUID, FK → profiles.id)
- combined_score (INTEGER, 0-100)
- stress_level (INTEGER, 0-10)
- workload_level (INTEGER, 0-10)
- created_at (TIMESTAMP)
- ... otros campos
```

## Cómo Configurar

### 1. En el Frontend
El sistema detecta automáticamente si es empleador:
- Cuando selecciona un departamento → Se guarda en `state.context.area`
- Ese valor se persiste al actualizar el perfil en Supabase

### 2. En el Backend
Asegurar que las variables de entorno estén configuradas:

```env
SUPABASE_URL=https://kdxoxusimqdznduwyvhl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-proj-...
```

## Limitaciones Actuales

1. **Rol Implícito**: Se considera "empleador" si tiene `department` asignado. Mejor sería una columna `role` explícita.
2. **15 días limitado**: Las mediciones del equipo se limitan a 15 días. Modificable si se requiere histórico mayor.
3. **Un equipo por usuario**: Actualmente cada usuario solo puede representar un departamento.

## Próximas Mejoras Sugeridas

1. Agregar columna `role` a tabla `profiles` (ej: 'worker', 'manager', 'admin')
2. Agregar filtros de fecha configurables
3. Permitir que un empleador vea múltiples equipos
4. Guardar historial de respuestas de Lia en Supabase
5. Agregar métricas de efectividad del chatbot
