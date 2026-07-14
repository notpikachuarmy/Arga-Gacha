# Arga Gacha v0.2

Prototipo web para GitHub Pages construido con Phaser, TypeScript y Vite.

## Novedades de la 0.2

- Carrusel de banners y pantalla de gacha sin panel que tape la ilustración.
- Revelado individual de invocaciones y opción «Mostrar todo».
- Cada copia obtenida es una unidad independiente con nivel, bloqueo y favorito.
- Códice separado con personajes sin descubrir ocultos.
- Pantallas independientes para Unidades y Equipo.
- Fichas de unidad rediseñadas.
- Selector de expediciones con dificultad y recompensas.
- Combate con barras y números de vida.
- Migración automática del guardado anterior.

## Desarrollo local

```bash
npm ci
npm run dev
```

## Publicación

El workflow `.github/workflows/deploy.yml` compila y publica automáticamente la carpeta `dist` en GitHub Pages.
