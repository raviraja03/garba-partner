import type { Transaction } from 'sequelize';
import type { AreaDto, CityDto } from '@garba-partner/shared';
import { AppError } from '../../lib/app-error.js';
import { Area, City } from '../../models/index.js';

export function toCityDto(city: City): CityDto {
  return { id: city.id, name: city.name, state: city.state };
}

export function toAreaDto(area: Area): AreaDto {
  return { id: area.id, cityId: area.cityId, name: area.name };
}

export async function listActiveCities(): Promise<CityDto[]> {
  const cities = await City.findAll({
    where: { isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  return cities.map(toCityDto);
}

export async function listActiveAreas(cityId: string): Promise<AreaDto[]> {
  const city = await City.findOne({ where: { id: cityId, isActive: true }, attributes: ['id'] });
  if (!city) throw new AppError('NOT_FOUND', { message: 'City not found.' });
  const areas = await Area.findAll({
    where: { cityId, isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  return areas.map(toAreaDto);
}

/**
 * Validates a city/area choice for a profile: both must exist and be active, and the area must
 * belong to the city. Returns VALIDATION_ERROR with field paths on failure.
 */
export async function assertValidLocation(
  cityId: string,
  areaId: string | null,
  transaction?: Transaction,
): Promise<void> {
  const options = transaction ? { transaction } : {};
  const city = await City.findOne({ where: { id: cityId, isActive: true }, ...options });
  if (!city) {
    throw new AppError('VALIDATION_ERROR', {
      details: [{ path: 'cityId', message: 'Choose one of the available cities.' }],
    });
  }
  if (areaId === null) return;
  const area = await Area.findOne({ where: { id: areaId, cityId, isActive: true }, ...options });
  if (!area) {
    throw new AppError('VALIDATION_ERROR', {
      details: [{ path: 'areaId', message: 'Choose an area in the selected city.' }],
    });
  }
}
