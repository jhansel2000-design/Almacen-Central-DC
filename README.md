# Almacén Central DC

Plataforma web de **control ejecutivo de almacén**: importación Excel, dashboards, modo TV, **despacho** (preparador/validador) y **red local (LAN)** para varios dispositivos en el mismo WiFi.

## Módulos del sistema

| Módulo | Qué muestra | Excel |
|--------|-------------|--------|
| **Centro de mando** | KPIs unificados de operación y facturas | — (lee datos publicados) |
| **Operaciones** | Abiertos, en proceso, tendencias, por área | Control de almacén |
| **Facturas** | Ventas por almacén en RD$, metas, gráficos | Diario de facturas |
| **Productividad** | Rendimiento por empleado (tabla dinámica) | Pivot productividad |
| **Despacho** | Preparador ↔ Validador (portal propio) | — |
| **Reportes** | Informe consolidado + export PDF/TXT | — |

Cada módulo guarda sus datos por separado (sin mezclar registros).

## Inicio rápido

```powershell
cd ruta\janselcastrolll
.\serve-dashboard.ps1
```

Abrir: **http://localhost:8080**

> No abrir `index.html` como archivo local (`file://`). Requiere servidor HTTP.

Puerto alternativo: `.\serve-dashboard.ps1 -Port 8765`

### Red local (LAN)

Varios dispositivos en el mismo WiFi comparten datos en tiempo real.

```powershell
.\serve-dashboard.ps1
# Otros dispositivos: http://192.168.X.X:8080
```

- Guía LAN: **[GUIA_RED_LOCAL.md](GUIA_RED_LOCAL.md)**
- Abrir firewall: **`ABRIR-ACCESO-RED.bat`** (como Administrador)
- Subir a GitHub: **[GITHUB.md](GITHUB.md)**

### Portal Despacho (login separado)

- Desde el login del WMS: tarjeta **Portal de Despacho**
- Directo: **http://localhost:8080/despacho.html**

## Credenciales demo

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Administrador | `admin` | `JANSELCASTRO01` |
| Supervisor | `supervisor` | `SUPERVISOR01` |
| Operador | `operador` | `CASTRO01` |
| Preparador despacho | `preparador` | `CASTRO01` |
| Validador despacho | `validador` | `SUPERVISOR01` |

- Sesión: 12 h en el navegador.
- Bloqueo tras 5 intentos fallidos (15 min).

> **Nota:** Contraseñas de demostración. Cámbialas antes de producción.

## Guía para presentar

Ver **[GUIA_PRESENTACION.md](GUIA_PRESENTACION.md)** — guion de demo (15–20 min).

## Flujo recomendado

1. Iniciar sesión como **admin** o **supervisor**.
2. **Administración** → importar Excels (Operaciones, Productividad, Facturas).
3. **Centro de mando** — vista ejecutiva unificada.
4. **Despacho** — preparador y validador (portal independiente).
5. **Modo TV** — rotación de dashboards; salir con **Esc**.
6. **Reportes** — informe consolidado y exportación.

## Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Alt+1` | Centro de mando |
| `Alt+2` | Productividad |
| `Alt+3` | Operaciones |
| `Alt+4` | Facturas |
| `Alt+5` | Despacho |
| `Alt+6` | Reportes |
| `Alt+7` | Administración |
| `R` | Actualizar datos |
| `T` | Tema claro/oscuro |
| `Esc` | Salir modo TV |
| `?` | Ayuda |

## Estructura técnica

| Área | Archivos principales |
|------|----------------------|
| UI / orquestación | `index.html`, `js/platform-app.js` |
| Despacho | `despacho.html`, `js/platform-despacho-*.js` |
| Servidor LAN | `server/lan-server.js`, `js/platform-lan-sync.js` |
| Modo TV | `js/platform-tv-dashboard.js` |
| Excel | `js/platform-excel-*.js` |
| Datos | `js/platform-store.js`, `data/` (runtime) |
| Admin | `js/platform-admin*.js` |

## Requisitos

- Navegador moderno (Chrome / Edge recomendado).
- **Node.js** (para `serve-dashboard.ps1` y servidor LAN).
- Internet en la primera carga (CDN: Chart.js, SheetJS). LAN funciona sin internet tras la primera carga en caché.

## Seguridad (alcance actual)

Dashboard **cliente + servidor LAN local**. Para producción en internet: HTTPS, autenticación en servidor, contraseñas fuertes y no exponer API keys en el navegador.

## Checklist antes de presentar

- [ ] Servidor en marcha (`.\serve-dashboard.ps1`)
- [ ] Firewall abierto si usas LAN (`ABRIR-ACCESO-RED.bat`)
- [ ] Excels importados (Operaciones, Facturas, Productividad)
- [ ] Chips verdes en barra superior
- [ ] Probar Despacho desde dos dispositivos
- [ ] Probar Modo TV (Esc para salir)

---

**Versión:** plataforma v3 — Centro de mando, Despacho, LAN multi-dispositivo, Modo TV.
