// Native fetch is available in Node 18+

const BASE_URL = "http://192.168.101.200:8090/api/v1"
const ENTERPRISE_NAME = "星河智绘默认工作室"

async function seed() {
    try {
        console.log("创建企业...");
        const res = await fetch(`${BASE_URL}/enterprises`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: ENTERPRISE_NAME, display_name: ENTERPRISE_NAME})
        });
        const entData = await res.json();
        const entId = entData.data.id;
        console.log("企业创建成功, ID:", entId);

        console.log("创建管理员账户...");
        const adminRes = await fetch(`${BASE_URL}/users`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: '郭瑞凡',
                password: 'qazwsx123',
                display_name: '郭瑞凡',
                role: 'admin',
                department: '管理部',
                enterprise_id: entId
            })
        });
        console.log("管理员创建成功:", await adminRes.json());
        console.log("种子数据注入完成！可以登录了。");
    } catch (e) {
        console.error("Error:", e);
    }
}
seed();
