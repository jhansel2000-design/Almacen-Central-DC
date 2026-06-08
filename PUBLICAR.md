# Cómo está publicado Almacén Central DC

## URL pública (GitHub Pages)

**https://jhansel2000-design.github.io/Almacen-Central-DC/**

La URL depende del **nombre del repositorio** en GitHub (`Almacen-Central-DC`).

### Si aún ves `mi-web-DC` en la URL — renombrar en GitHub (1 minuto)

1. Abre: https://github.com/jhansel2000-design/mi-web-DC/settings  
   (o ejecuta `RENOMBRAR-URL-GITHUB.bat` en esta carpeta)
2. Arriba, en **Repository name**, escribe: **`Almacen-Central-DC`**
3. Pulsa **Rename**
4. En PowerShell, en esta carpeta:

```powershell
git remote set-url origin https://github.com/jhansel2000-design/Almacen-Central-DC.git
git push origin main
```

La web quedará en la nueva URL en **2–5 minutos**. La antigua (`…/mi-web-DC/`) redirige un tiempo.

---

## 1. Código en GitHub

https://github.com/jhansel2000-design/Almacen-Central-DC

---

## 2. Web pública en internet (GitHub Pages)

**URL:**

https://jhansel2000-design.github.io/Almacen-Central-DC/

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
