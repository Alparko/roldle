# roldle

Juego web local tipo Wordle/Loldle para adivinar personajes de partidas de rol a partir de un CSV.

## Publicarlo con GitHub Pages

El proyecto ya incluye el workflow [deploy-pages.yml](./.github/workflows/deploy-pages.yml) para desplegarlo automaticamente en GitHub Pages cuando hagas `push` a la rama `main`.

Pasos:

1. Crea un repositorio nuevo en GitHub, por ejemplo `roldle`.
2. Sube el contenido de esta carpeta a ese repositorio.
3. En GitHub entra en `Settings > Pages`.
4. En `Build and deployment`, selecciona `Source: GitHub Actions`.
5. Haz `push` a la rama `main`.
6. Espera a que termine el workflow `Deploy roldle to GitHub Pages`.

La URL normal quedara asi:

```text
https://TU-USUARIO.github.io/roldle/
```

Si el repositorio no se llama `roldle`, cambia la ultima parte por el nombre real del repo.

## Stack elegido

Se ha usado `HTML + CSS + JavaScript` nativo para que el proyecto pueda ejecutarse ya mismo en localhost sin depender de `node` o `npm`, que no estan instalados en este entorno. Para servirlo localmente basta con `python`.

## Como arrancarlo

Desde la carpeta del proyecto:

```powershell
python serve_local.py
```

Luego abre en el navegador:

```text
http://localhost:8000
```

## Como funciona

- El personaje objetivo se elige de forma determinista segun la fecha de `Europe/Madrid`, asi que cambia a las `00:00` de Madrid para todo el mundo.
- El estado de la partida se guarda en `localStorage`.
- La base de datos de demo esta en [data/personajes.csv](./data/personajes.csv).
- Las similitudes configurables se definen en [data/agrupaciones.json](./data/agrupaciones.json).

## Control local del reto

El boton visible para `Pasar al siguiente` se ha quitado de la interfaz, pero la logica sigue en el codigo por si quieres reactivarla.

Desde tu navegador puedes controlarlo localmente abriendo la consola y usando:

```js
window.roldleAdmin.getCurrentTarget()
window.roldleAdmin.advanceDay()
window.roldleAdmin.advanceDay(3)
window.roldleAdmin.clearOverride()
window.roldleAdmin.getChallengeDate()
```

Eso solo afecta al navegador de tu ordenador, no al reto publico que ven los demas.

## Formato del CSV

Cabeceras esperadas:

```text
id,nombre,raza,clase,sexo,jugador,partida
```

Puedes sustituir el CSV de demo por tu propia base de personajes manteniendo esas columnas.

Si un personaje es multiclase, escribe ambas clases separadas por `/`.

```text
8,Helena Voss,Humana,Artifice / Mago,Mujer,Lucia,Cronicas de Hierro
```

En el tablero, `Clase` se marca:

- Verde si coinciden todas las clases.
- Amarillo si coincide una clase pero no la combinacion completa.
- Rojo si no coincide ninguna.

## Agrupaciones de similitud

En [data/agrupaciones.json](./data/agrupaciones.json) puedes definir valores parecidos para que salgan en amarillo en lugar de rojo.

Ejemplo:

```json
{
  "partida": [
    ["Waterdeep", "Waterdeep 2"]
  ]
}
```

Con esa configuracion, si el objetivo tiene `Waterdeep 2` y pruebas un personaje con `Waterdeep`, la columna `Partida` se marcara en amarillo.
