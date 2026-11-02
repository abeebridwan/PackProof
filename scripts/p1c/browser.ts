import {chromium,expect as baseExpect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const expect=baseExpect.configure({timeout:90000});
const origin='http://localhost:4181';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const checks:Record<string,unknown>={mode:'production local UI + actual Supabase + recorded AI; not live acceptance',providerRequests:0,actualPhone:false};
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.setDefaultTimeout(90000);
 await page.goto(origin);await expect(page.getByText('AI responses are replayed for this demo.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('button',{name:'Investigating…'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();await expect(page.getByText(/visible wrapper artwork changed/).first()).toBeVisible();expect(await page.locator('.references code').count()).toBeGreaterThan(0);checks.inputsProgressSignedResultsAndNotice='passed';
 await page.getByRole('button',{name:'Shop A · unauthorized seller'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'Blocked',exact:true})).toBeVisible();await expect(page.getByText('Transfer blocked: seller is not authorized for this registered item.',{exact:true}).first()).toBeVisible();checks.shopARefusal='passed';
 await page.getByRole('button',{name:'Incomplete custody history'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'Needs evidence',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'A history gap remains'})).toBeVisible();checks.historyGap='passed';
 await page.getByRole('button',{name:'Shop B · matching records'}).click();await page.getByLabel('Packaging code optional').fill('');await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();
 await page.getByLabel('Packaging code you can read').fill('PK-2002');await page.getByRole('button',{name:'Continue with this evidence'}).click();await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Record-supported',exact:true})).toBeVisible();checks.pauseResumeReload='passed';
 await page.getByRole('button',{name:'An item in front of me'}).click();await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByRole('heading',{name:'One more detail'})).toBeVisible();await expect(page.getByText('Physical item: Unresolved',{exact:true})).toBeVisible();
 await page.getByLabel('Product code, if corrected').fill('000042');await page.getByLabel('Packaging code you can read').fill('000043');await page.getByRole('button',{name:'Continue with this evidence'}).click();await expect(page.getByText('000042 · 000043 · Physical evidence requested',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Needs evidence',exact:true})).toBeVisible();await expect(page.getByText('Physical item: Unresolved',{exact:true})).toBeVisible();checks.leadingZerosAndNoPhysicalSuccess='passed';
 await page.route('**/api/investigations',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporarily_unavailable',message:'Controlled unavailable-service check.'})}));
 await page.getByRole('button',{name:'Investigate evidence'}).click();await expect(page.getByText('Controlled unavailable-service check.',{exact:true})).toBeVisible();checks.controlledErrorState='passed';
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);checks.mobileNoOverflow='passed';
 await page.screenshot({path:'docs/packproof/evidence/p1c-ui.png',fullPage:true});
 await context.close();checks.status='passed';await writeFile('docs/packproof/evidence/p1c-browser.json',JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser.close();}
