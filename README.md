# Argagacha

Prototipo web de gacha multiverso preparado para GitHub Pages.

## Concepto de contenido

Cada mundo funciona como una franquicia interna independiente. Hoennia es el primer archipiélago/universo y posee su propio banner, personajes, enemigos, fondo y lore. Los mundos futuros se añaden mediante datos sin reescribir los sistemas principales.

## Incluido en este prototipo

- Colección de personajes y ficha de lore.
- Equipo de hasta 3 personajes.
- Banner de Hoennia con tiradas de 2 a 5 estrellas.
- Duplicados convertidos en fragmentos.
- Combate automático 3 contra 3.
- Ventajas de clase y animación de ataque mediante empujón.
- Derrota mediante desvanecimiento del sprite.
- Guardado local con `localStorage`.
- Despliegue automático con GitHub Actions.

## Ejecutar localmente

```bash
npm install
npm run dev
```

## Compilar

```bash
npm run build
```

## Publicar en GitHub Pages

1. Crea un repositorio y sube estos archivos a la rama `main`.
2. En GitHub abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **GitHub Actions**.
4. Cada `push` a `main` compilará y publicará el juego.

## Datos

- `src/data/worlds.json`: mundos o franquicias internas.
- `src/data/banners.json`: banners asociados a cada mundo.
- `src/data/characters.json`: personajes.
- `src/data/enemies.json`: enemigos.
- `src/data/classes.json`: clases y ventajas.

Las clases de Vex-9, General Atlas, Blackjack, Grizzly y Raven están marcadas como provisionales.
