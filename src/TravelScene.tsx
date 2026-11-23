import travelArtwork from './travelArtwork.svg?url';

export function TravelScene({ mini = false }: { mini?: boolean }) {
  return <div className={`travel-scene${mini ? ' travel-scene-mini' : ''}`} aria-hidden="true">
    <img className="travel-art" src={travelArtwork} alt="" draggable="false" />
  </div>;
}
