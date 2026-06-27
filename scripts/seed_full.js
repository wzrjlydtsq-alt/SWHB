const BASE_URL = 'http://192.168.101.200:8090/api/v1';

const DEPARTMENTS = ['技术部', '管理部', '制作一组', '制作二组', '制作三组', '制作四组', '制作五组'];
const USERS = [
  { name: '郭瑞凡', department: '技术部', role: 'admin' },
  { name: '周奕名', department: '制作一组', role: 'director' },
  { name: '张宇轩', department: '制作一组', role: 'member' },
  { name: '罗泳', department: '制作一组', role: 'member' },
  { name: '杨振超', department: '制作一组', role: 'member' },
  { name: '李晨露', department: '制作二组', role: 'director' },
  { name: '陈皞', department: '制作二组', role: 'member' },
  { name: '张佳', department: '制作二组', role: 'member' },
  { name: '何梓菁', department: '制作三组', role: 'director' },
  { name: '李如玲', department: '制作三组', role: 'member' }
];

async function seed() {
    for (const d of DEPARTMENTS) {
        await fetch(BASE_URL + '/departments', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: d})
        }).catch(()=>null);
        console.log('Created dept', d);
    }
    for (const u of USERS) {
        await fetch(BASE_URL + '/users', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: u.name, password: '123', display_name: u.name,
                role: u.role, department: u.department, enterprise_id: 1
            })
        }).catch(()=>null);
        console.log('Created user', u.name);
    }
}
seed();
