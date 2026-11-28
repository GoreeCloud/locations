# frozen_string_literal: true

module GoreeCloudLocations
  # Offline aggregate export; never copies source properties or exact points.
  class PrivateGrid
    MAX_FEATURES = 1_000_000
    MIN_GRID_DEGREES = 0.1

    def self.call(document, grid_degrees: 0.1, minimum_points: 10)
      unless grid_degrees.is_a?(Numeric) && grid_degrees.finite? && grid_degrees.between?(MIN_GRID_DEGREES, 10)
        raise ArgumentError, 'grid degrees must be between 0.1 and 10'
      end
      unless minimum_points.is_a?(Integer) && minimum_points.between?(5, MAX_FEATURES)
        raise ArgumentError, 'minimum points must be between 5 and 1000000'
      end
      unless document.is_a?(Hash) && document['type'] == 'FeatureCollection' &&
             document['features'].is_a?(Array) && document['features'].size <= MAX_FEATURES
        raise ArgumentError, 'expected a bounded GeoJSON FeatureCollection'
      end

      # Integer grid indices avoid unstable floating-point hash keys.
      counts = Hash.new(0)
      document['features'].each do |feature|
        geometry = feature.is_a?(Hash) && feature['type'] == 'Feature' && feature['geometry']
        unless geometry.is_a?(Hash) && geometry['type'] == 'Point'
          raise ArgumentError, 'only Point features are supported'
        end
        coords = geometry['coordinates']
        unless coords.is_a?(Array) && coords.size.between?(2, 3) &&
               coords.all? { |x| x.is_a?(Numeric) && x.finite? } &&
               coords[0].between?(-180, 180) && coords[1].between?(-90, 90)
          raise ArgumentError, 'invalid point coordinates'
        end

        lon, lat = coords
        x = [[((lon + 180) / grid_degrees).floor, 0].max, (360 / grid_degrees).ceil - 1].min
        y = [[((lat + 90) / grid_degrees).floor, 0].max, (180 / grid_degrees).ceil - 1].min
        counts[[x, y]] += 1
      end

      features = counts.sort.filter_map do |(x, y), count|
        next if count < minimum_points

        west = (-180 + x * grid_degrees).round(8)
        south = (-90 + y * grid_degrees).round(8)
        east = [180, (west + grid_degrees).round(8)].min
        north = [90, (south + grid_degrees).round(8)].min
        {
          'type' => 'Feature',
          'geometry' => { 'type' => 'Polygon',
                          'coordinates' => [[[west, south], [east, south], [east, north],
                                             [west, north], [west, south]]] },
          'properties' => { 'point_count' => count }
        }
      end
      { 'type' => 'FeatureCollection', 'features' => features }
    end
  end
end
