import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPoint, circleRing, distance, validFence } from '../src/utils/geofence.js';
const circle = { name:'Patrol', zone:'NORTH', shape:'circle', center:[78,29], radius:1000, rules:{fire:true,entry:false,exit:false} };
test('circle contains only points within radius', () => {
 assert.equal(containsPoint(circle,[78,29]),true);
 assert.equal(containsPoint(circle,[78.1,29]),false);
 assert.ok(Math.abs(distance(circle.center,circleRing(circle.center,1000)[5])-1000)<.01);
});
test('polygon containment excludes bounding-box-only matches', () => {
 const polygon={...circle,shape:'polygon',vertices:[[0,0],[2,0],[0,2]]};
 assert.equal(containsPoint(polygon,[.2,.2]),true);
 assert.equal(containsPoint(polygon,[1.8,1.8]),false);
});
test('invalid and incomplete fences cannot be saved', () => {
 assert.equal(validFence(circle),null);
 assert.ok(validFence({...circle,zone:''}));
 assert.ok(validFence({...circle,shape:'polygon',vertices:[[0,0],[1,1],[2,2]]}));
 assert.ok(validFence({...circle,shape:'polygon',vertices:[]}));
 assert.ok(validFence({...circle,center:[NaN,29]}));
 assert.ok(validFence(null));
});
