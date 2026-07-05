# Ukelele Fácil 🪕

PWA para aprender ukelele en 15 min/día: afinador con micrófono, acordes con sonido, entrenador de rasgueo, reto de cambios por minuto, rutina cronometrada y niveles con puertas medibles.

## Desplegar (Vercel)
1. Sube esta carpeta a un repo de GitHub (sin `node_modules` ni `dist`).
2. En Vercel: **Add New → Project → Import** del repo. Framework: Vite (lo detecta solo). Deploy.

## Instalar en el móvil
- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar aplicación**.
- **iPhone (Safari):** abre la URL → botón Compartir → **Añadir a pantalla de inicio**.

## Desarrollo local
```bash
npm install
npm run dev      # desarrollo
npm run build    # verificación antes de commit
```

Nota: el afinador con micrófono requiere HTTPS (Vercel lo da por defecto) y permiso de micrófono.
