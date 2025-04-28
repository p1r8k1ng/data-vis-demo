import { parseArtworks, groupByTimePeriod, groupByCreator } from '../src/dataParser.js';

describe('Data Parsing and Transformation', () => {
  const rawItems = [
    {
      id: 'art1',
      title: ['Title One'],
      edmIsShownBy: ['url1'],
      edmTimespanLabel: [{ def: '1900' }],
      edmAgentLabel: [{ def: 'Alice' }]
    },
    {
      id: 'art2',
      dcTitleLangAware: { def: ['Title Two'] },
      edmIsShownBy: ['url2'],
      edmTimespanLabel: [{ def: '1900' }],
      dcCreator: ['Bob']
    },
    {
      id: 'art3',
      edmIsShownBy: [], // should be filtered out
      edmTimespanLabel: [{ def: '1800' }],
      edmAgentLabel: [{ def: 'Alice' }]
    },
    {
      id: 'art4',
      edmIsShownBy: ['url4'],
      // missing timespan & creators
    }
  ];

  let artworks;
  beforeAll(() => {
    artworks = parseArtworks(rawItems);
  });

  test('parseArtworks filters and transforms items correctly', () => {
    expect(artworks).toHaveLength(3);
    // art1
    expect(artworks[0]).toEqual({
      id: 'art1',
      title: 'Title One',
      timePeriod: '1900',
      creators: ['Alice']
    });
    // art2
    expect(artworks[1]).toEqual({
      id: 'art2',
      title: 'Title Two',
      timePeriod: '1900',
      creators: ['Bob']
    });
    // art4 falls back
    expect(artworks[2]).toEqual({
      id: 'art4',
      title: 'Untitled',
      timePeriod: 'Unknown Period',
      creators: ['Unknown Artist']
    });
  });

  test('groupByTimePeriod groups correctly', () => {
    const map = groupByTimePeriod(artworks);
    expect(map.size).toBe(2);
    expect(map.get('1900')).toHaveLength(2);
    expect(map.get('Unknown Period')).toHaveLength(1);
  });

  test('groupByCreator groups correctly', () => {
    const map = groupByCreator(artworks);
    expect(map.size).toBe(3);
    expect(map.get('Alice')).toHaveLength(1);
    expect(map.get('Bob')).toHaveLength(1);
    expect(map.get('Unknown Artist')).toHaveLength(1);
  });
});
