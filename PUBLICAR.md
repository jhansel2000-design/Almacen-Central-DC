# Cómo está publicado Almacén Central DC

## 1. Código en GitHub (ya hecho)

https://github.com/jhansel2000-design/mi-web-DC

---

## 2. Web pública en internet (GitHub Pages)

**URL:**

https://jhansel2000-design.github.io/mi-web-DC/

La primera publicación tarda **2–5 minutos** después de cada cambio en `main`.

En el repo: **Settings → Pages** → debe decir *GitHub Actions*.

### Qué funciona en la web pública

- Login demo, dashboards, importar Excel, despacho
- Datos en **tu navegador** (localStorage)
- Modo TV, gráficos (con internet para Chart.js)

### Qué NO funciona en GitHub Pages

- **Sincronización LAN** entre varios dispositivos (requiere `serve-dashboard.ps1`)
- Servidor Node en red local

Para la **empresa en el almacén** (celulares + PCs mismo WiFi):

```powershell
.\serve-dashboard.ps1
```

Link LAN: `http://TU-IP:8080`

---

## 3. Seguridad

La URL de GitHub Pages es **pública**. Las contraseñas del README son solo demo.
Cámbialas antes de uso real en producción.
