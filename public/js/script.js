// =========================
// APPU MODAL
// =========================

function openAppuModal(customerId, customerName, currentBalance) {

    const modal =
        document.getElementById("appuModal");

    modal.classList.add("show");


    // Customer details

    document.getElementById("appuCustomerId").value =
        customerId;

    document.getElementById("appuCustomerName").textContent =
        customerName;


    // Current balance

    document.getElementById("appuCurrentBalance").textContent =
        "₹" + currentBalance.toLocaleString("en-IN");


    // Initial new balance

    document.getElementById("appuNewBalance").textContent =
        "₹" + currentBalance.toLocaleString("en-IN");


    // Clear previous inputs

    document.getElementById("appuAmount").value = "";

    document.getElementById("appuDescription").value = "";


    // Store current balance

    document.getElementById("appuAmount").dataset.currentBalance =
        currentBalance;


    // Focus amount input

    document.getElementById("appuAmount").focus();

}



// =========================
// CLOSE APPU MODAL
// =========================

function closeAppuModal() {

    document
        .getElementById("appuModal")
        .classList.remove("show");

}



// =========================
// JAMA MODAL
// =========================

function openJamaModal(customerId, customerName, currentBalance) {

    const modal =
        document.getElementById("jamaModal");

    modal.classList.add("show");


    // Customer details

    document.getElementById("jamaCustomerId").value =
        customerId;

    document.getElementById("jamaCustomerName").textContent =
        customerName;


    // Current balance

    document.getElementById("jamaCurrentBalance").textContent =
        "₹" + currentBalance.toLocaleString("en-IN");


    // Initial new balance

    document.getElementById("jamaNewBalance").textContent =
        "₹" + currentBalance.toLocaleString("en-IN");


    // Clear previous inputs

    document.getElementById("jamaAmount").value = "";

    document.getElementById("jamaNote").value = "";


    // Default payment method

    document.getElementById("jamaPaymentMethod").value =
        "CASH";


    // Store current balance

    document.getElementById("jamaAmount").dataset.currentBalance =
        currentBalance;


    // Focus amount input

    document.getElementById("jamaAmount").focus();

}



// =========================
// CLOSE JAMA MODAL
// =========================

function closeJamaModal() {

    document
        .getElementById("jamaModal")
        .classList.remove("show");

}


async function sendPaymentReminder(customerId) {

    try {

        const response = await fetch(
            `/customers/${customerId}/reminder`,
            {
                method: "POST"
            }
        );
        const result = await response.json();

        alert(result.message);

    } catch (error) {

        console.error("Reminder error:", error);
        alert("Could not send the reminder. Please try again.");

    }

}

async function toggleCustomerWhatsApp(button, customerId) {

    const enabled = button.dataset.enabled !== "true";

    try {

        const response = await fetch(
            `/customers/${customerId}/whatsapp-preference`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ enabled })
            }
        );
        const result = await response.json();

        if (!result.success) {
            alert(result.message);
            return;
        }

        button.dataset.enabled = String(result.enabled);
        button.textContent = `WhatsApp ${result.enabled ? "On" : "Off"}`;

    } catch (error) {

        console.error("WhatsApp preference error:", error);
        alert("Could not update the WhatsApp preference. Please try again.");

    }

}



// =========================
// CUSTOMER SEARCH
// =========================

function normalizeSearchText(text) {

    return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}



function fuzzyMatch(text, query) {

    let textIndex = 0;
    let queryIndex = 0;


    while (
        textIndex < text.length &&
        queryIndex < query.length
    ) {

        if (text[textIndex] === query[queryIndex]) {
            queryIndex++;
        }

        textIndex++;

    }


    return queryIndex === query.length;

}



// =========================
// CALCULATE BALANCES
// =========================

document.addEventListener("DOMContentLoaded", () => {


    // =========================
    // APPU BALANCE
    // =========================

    const appuAmountInput =
        document.getElementById("appuAmount");


    if (appuAmountInput) {

        appuAmountInput.addEventListener("input", () => {

            const amount =
                Number(appuAmountInput.value) || 0;


            const currentBalance =
                Number(
                    appuAmountInput.dataset.currentBalance
                ) || 0;


            const newBalance =
                currentBalance + amount;


            document.getElementById("appuNewBalance").textContent =
                "₹" + newBalance.toLocaleString("en-IN");

        });

    }



    // =========================
    // JAMA BALANCE
    // =========================

    const jamaAmountInput =
        document.getElementById("jamaAmount");


    if (jamaAmountInput) {

        jamaAmountInput.addEventListener("input", () => {

            const amount =
                Number(jamaAmountInput.value) || 0;


            const currentBalance =
                Number(
                    jamaAmountInput.dataset.currentBalance
                ) || 0;


            const newBalance =
                currentBalance - amount;


            document.getElementById("jamaNewBalance").textContent =
                "₹" +
                Math.max(newBalance, 0)
                    .toLocaleString("en-IN");

        });

    }



    // =========================
    // SUBMIT APPU
    // =========================

    const appuForm =
        document.getElementById("appuForm");


    if (appuForm) {

        appuForm.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();


                const customerId =
                    document.getElementById(
                        "appuCustomerId"
                    ).value;


                const amount =
                    document.getElementById(
                        "appuAmount"
                    ).value;


                const description =
                    document.getElementById(
                        "appuDescription"
                    ).value;


                try {

                    const response =
                        await fetch(
                            `/customers/${customerId}/appu`,
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body: JSON.stringify({

                                    amount: amount,

                                    description:
                                        description

                                })
                            }
                        );


                    const result =
                        await response.json();


                    if (result.success) {

                        window.location.href = "/";

                    } else {

                        alert(result.message);

                    }


                } catch (error) {

                    console.error(
                        "Appu error:",
                        error
                    );

                    alert(
                        "Something went wrong. Please try again."
                    );

                }

            }
        );

    }



    // =========================
    // SUBMIT JAMA
    // =========================

    const jamaForm =
        document.getElementById("jamaForm");


    if (jamaForm) {

        jamaForm.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();


                const customerId =
                    document.getElementById(
                        "jamaCustomerId"
                    ).value;


                const amount =
                    document.getElementById(
                        "jamaAmount"
                    ).value;


                const paymentMethod =
                    document.getElementById(
                        "jamaPaymentMethod"
                    ).value;


                const note =
                    document.getElementById(
                        "jamaNote"
                    ).value;


                try {

                    const response =
                        await fetch(
                            `/customers/${customerId}/jama`,
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body: JSON.stringify({

                                    amount: amount,

                                    paymentMethod:
                                        paymentMethod,

                                    note: note

                                })
                            }
                        );


                    const result =
                        await response.json();


                    if (result.success) {

                        window.location.href = "/";

                    } else {

                        alert(result.message);

                    }


                } catch (error) {

                    console.error(
                        "Jama error:",
                        error
                    );

                    alert(
                        "Something went wrong. Please try again."
                    );

                }

            }
        );

    }



    // =========================
    // CUSTOMER AUTOCOMPLETE SEARCH
    // =========================

    const searchInput =
        document.getElementById("customerSearch");


    const searchResults =
        document.getElementById("customerSearchResults");


    const customerCards =
        document.querySelectorAll(".customer-box");


    // Search exists only on home page

    if (
        !searchInput ||
        !searchResults ||
        !customerCards.length
    ) {

        return;

    }



    searchInput.addEventListener("input", () => {

        const query =
            normalizeSearchText(searchInput.value);


        // Clear previous results

        searchResults.innerHTML = "";


        // Nothing typed

        if (!query) {

            searchResults.classList.remove("show");

            return;

        }



        const results = [];


        customerCards.forEach(card => {

            const customerId =
                card.dataset.customerId;


            const customerName =
                card.dataset.customerName || "";


            const customerVillage =
                card.dataset.customerVillage || "";


            const normalizedName =
                normalizeSearchText(customerName);


            const nameMatch =
                normalizedName.includes(query);


            // Fuzzy name matching

            const fuzzyNameMatch =
                fuzzyMatch(
                    normalizedName.replace(/\s/g, ""),
                    query.replace(/\s/g, "")
                );


            if (
                nameMatch ||
                fuzzyNameMatch
            ) {

                results.push({

                    id: customerId,

                    name: customerName,

                    village: customerVillage

                });

            }

        });



        // =========================
        // NO RESULTS
        // =========================

        if (!results.length) {

            searchResults.innerHTML = `

                <div class="search-no-results">

                    No customers found

                </div>

            `;

            searchResults.classList.add("show");

            return;

        }



        // =========================
        // CREATE RESULTS
        // =========================

        results.forEach(customer => {

            const resultItem =
                document.createElement("div");


            resultItem.className =
                "search-result-item";


            resultItem.innerHTML = `

                <div class="search-result-avatar">

                    ${customer.name
                        .charAt(0)
                        .toUpperCase()}

                </div>


                <div class="search-result-info">

                    <strong>

                        ${customer.name}

                    </strong>


                    <span>

                        ${customer.village || "Village not added"}

                    </span>

                </div>

            `;


            resultItem.addEventListener(
                "click",
                () => {

                    window.location.href =
                        `/customers/${customer.id}/history`;

                }
            );


            searchResults.appendChild(resultItem);

        });



        searchResults.classList.add("show");

    });



    // =========================
    // CLOSE SEARCH RESULTS
    // =========================

    document.addEventListener("click", (event) => {

        const clickedInsideSearch =
            event.target.closest(".header-search");


        if (!clickedInsideSearch) {

            searchResults.classList.remove("show");

        }

    });


});