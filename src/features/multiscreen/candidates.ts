import type { RoomData } from '../../adapters/douyu/rooms';
import { roomSearchTerm } from '../../adapters/douyu/room-search';

export interface CandidateGroup { id: string; label: string; rooms: RoomData[] }

export function filterCandidates(groups: CandidateGroup[], query: string) {
  const term = roomSearchTerm(query).toLocaleLowerCase();
  return groups.map(group => ({ ...group, rooms: group.rooms.filter(room => room.showStatus === '1'
    && (!term || room.nn.toLocaleLowerCase().includes(term) || String(room.rid).includes(term))) })).filter(group => group.rooms.length);
}
