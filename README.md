# GeoVisor Antioquia 🌦️🗺️

GeoVisor interactivo para el monitoreo meteorológico en tiempo real de precipitaciones y reflectividad de radar para el Valle de Aburrá y el Oriente Antioqueño (Colombia).

## 🚀 Características

- **Visualización en tiempo real**: Capa de simulación e interpolación de radar meteorológico sobre mapa interactivo Leaflet.
- **Monitoreo de 18 Municipios**:
  - *Valle de Aburrá*: Medellín, Bello, Itagüí, Envigado, Sabaneta, Caldas, La Estrella, Copacabana, Girardota, Barbosa.
  - *Oriente Antioqueño*: Rionegro, Marinilla, Guarne, El Carmen de Viboral, El Retiro, El Santuario, La Ceja, San Vicente Ferrer.
- **Sincronización meteorológica**: Integración con la API de Open-Meteo con actualización dinámica en vivo y botón de refresco rápido.
- **Diseño Responsivo**: Adaptado para dispositivos móviles con paneles colapsables, menú desplegable, leyenda inferior optimizada y controles intuitivos.
- **Capas personalizables**: Selector de mapas base (Esri Dark Gray, OpenStreetMap, CartoDB Positron, Esri World Imagery, OpenTopoMap) y control de opacidad de precipitaciones.

## 🛠️ Tecnologías

- **Vite** + **TypeScript**
- **Leaflet & Open-Meteo API**
- **Lucide Icons**
- **Tailwind CSS**

## 📦 Instalación y Desarrollo Local

```bash
# Clonar el repositorio
git clone https://github.com/Tavo-bat/GeoVisor.git
cd GeoVisor

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build
```
