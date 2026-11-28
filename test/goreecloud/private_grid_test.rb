# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'tmpdir'
require 'open3'
require_relative '../../lib/goreecloud_locations/private_grid'

class PrivateGridTest < Minitest::Test
  def point(lon, lat)
    { 'type' => 'Feature', 'id' => 'private-id',
      'geometry' => { 'type' => 'Point', 'coordinates' => [lon, lat, 12] },
      'properties' => { 'email' => 'private@example.invalid', 'timestamp' => 123456789 } }
  end

  def collection(points)
    { 'type' => 'FeatureCollection', 'features' => points, 'private' => 'secret' }
  end

  def test_aggregates_and_suppresses_without_copying_metadata
    input = collection(Array.new(10) { point(1.034, 2.056) } + [point(20, 30)])
    result = GoreeCloudLocations::PrivateGrid.call(input)
    assert_equal 1, result['features'].size
    assert_equal({ 'point_count' => 10 }, result['features'][0]['properties'])
    assert_equal 'Polygon', result['features'][0]['geometry']['type']
    refute_match(/private|timestamp|1\.034|2\.056/, JSON.generate(result))
    assert_equal 11, input['features'].size
  end

  def test_boundary_coordinates_are_bounded
    result = GoreeCloudLocations::PrivateGrid.call(collection(Array.new(10) { point(180, 90) }))
    coordinates = result['features'][0]['geometry']['coordinates'][0]
    assert coordinates.all? { |lon, lat| lon.between?(-180, 180) && lat.between?(-90, 90) }
    assert_equal coordinates.first, coordinates.last
  end

  def test_invalid_inputs_fail_closed
    assert_raises(ArgumentError) { GoreeCloudLocations::PrivateGrid.call(collection([point(181, 0)])) }
    assert_raises(ArgumentError) { GoreeCloudLocations::PrivateGrid.call(collection([point(0, Float::NAN)])) }
    assert_raises(ArgumentError) { GoreeCloudLocations::PrivateGrid.call(collection([{}])) }
    assert_raises(ArgumentError) { GoreeCloudLocations::PrivateGrid.call(collection([]), grid_degrees: 0.01) }
    assert_raises(ArgumentError) { GoreeCloudLocations::PrivateGrid.call(collection([]), minimum_points: 1) }
  end

  def test_cli_never_overwrites_and_creates_private_file
    Dir.mktmpdir do |dir|
      source = File.join(dir, 'source.json')
      target = File.join(dir, 'target.json')
      File.write(source, JSON.generate(collection(Array.new(10) { point(1, 2) })))
      cli = File.expand_path('../../bin/gc-private-grid', __dir__)
      _, _, status = Open3.capture3(RbConfig.ruby, cli, source, target)
      assert status.success?
      assert_equal 0o600, File.stat(target).mode & 0o777
      original = File.read(target)
      _, _, status = Open3.capture3(RbConfig.ruby, cli, source, target)
      refute status.success?
      assert_equal original, File.read(target)
      _, _, status = Open3.capture3(RbConfig.ruby, cli, source, source)
      refute status.success?
      assert_equal 10, JSON.parse(File.read(source))['features'].size
    end
  end
end
